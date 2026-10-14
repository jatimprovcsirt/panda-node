import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { LocalKeyProvider } from '../crypto/keys';
import { FieldCipher } from '../crypto/cipher';
import { Envelope } from '../envelope/envelope';
import { validateToken, isDemoToken, isLocalEnvironment } from '../crypto/tokenValidator';
import { runInitWizard } from './commands/init-wizard';
import { packageVersion } from '../version';
import { runGenerateCommand } from './commands/generate';
import { runStatusCommand } from './commands/status';
import { runConfigCommand } from './commands/config';
import { runDeinitCommand } from './commands/deinit';

/**
 * The provider names `--provider` accepts.
 *
 * Exported so the tests can name them rather than write them out again. A test
 * that restates a rule asserts its own copy of it — which is how the token
 * pattern's second copy in this repository survived a release.
 */
export const PROVIDERS = ['local', 'vault', 'infisical'];

/**
 * The environment variables each provider is configured from on the
 * non-interactive path. These are the names VaultKeyProvider,
 * InfisicalKeyProvider and CLAUDE.md's environment reference already use.
 */
export const VAULT_REQUIRED_ENV = ['PANDA_VAULT_URL'];
export const VAULT_APPROLE_ENV = ['PANDA_VAULT_ROLE_ID', 'PANDA_VAULT_SECRET_ID'];
export const INFISICAL_REQUIRED_ENV = [
  'PANDA_INFISICAL_CLIENT_ID',
  'PANDA_INFISICAL_CLIENT_SECRET',
  'PANDA_INFISICAL_PROJECT_ID',
];

/** Thrown when the environment does not describe the provider that was asked for. */
export class ProviderConfigError extends Error {}

function envAllSet(names: string[]): boolean {
  return names.every((name) => !!process.env[name]);
}

/**
 * Throw naming every variable that is missing, not only the first. A refusal
 * that says "Vault is not configured" sends the reader to the documentation;
 * one that lists the variables sends them to their shell.
 */
function requireEnv(names: string[], provider: string): void {
  const absent = names.filter((name) => !process.env[name]);
  if (absent.length === 0) return;

  const verb = absent.length > 1 ? 'These are' : 'It is';
  throw new ProviderConfigError(
    `--provider ${provider} needs ${absent.join(' and ')} to be set. ${verb} read ` +
      `from the environment: this path cannot ask, and defaulting would write a ` +
      `configuration nobody chose.`
  );
}

/**
 * Fill a non-local provider's settings from the environment, or throw.
 *
 * Fail-closed, as the token gate on this path is. The wizard may offer
 * http://127.0.0.1:8200 as a default because a person is there to see it and
 * disagree; `--quick` cannot ask.
 */
export function applyProviderEnv(credentials: any, provider: string): void {
  if (provider === 'vault') {
    requireEnv(VAULT_REQUIRED_ENV, provider);

    let method = process.env.PANDA_VAULT_AUTH_METHOD;
    if (!method) {
      // Inferred where it is unambiguous. Demanding the variable when the
      // caller has already answered the question by setting the role and
      // secret, or a token, is the difference between a quick init that works
      // and one that argues.
      if (envAllSet(VAULT_APPROLE_ENV)) method = 'approle';
      else if (process.env.PANDA_VAULT_TOKEN) method = 'token';
      else requireEnv(['PANDA_VAULT_AUTH_METHOD'], provider);
    }

    if (method !== 'approle' && method !== 'token') {
      throw new ProviderConfigError(
        `PANDA_VAULT_AUTH_METHOD must be 'approle' or 'token', not '${method}'.`
      );
    }

    credentials.vaultUrl = process.env.PANDA_VAULT_URL;
    credentials.vaultAuthMethod = method;
    credentials.vaultMount = process.env.PANDA_VAULT_MOUNT_PATH || 'secret';

    if (method === 'approle') {
      requireEnv(VAULT_APPROLE_ENV, provider);
      credentials.vaultRoleId = process.env.PANDA_VAULT_ROLE_ID;
      credentials.vaultSecretId = process.env.PANDA_VAULT_SECRET_ID;
      credentials.vaultTokenTTL = process.env.PANDA_VAULT_TOKEN_TTL || '3600';
    } else {
      requireEnv(['PANDA_VAULT_TOKEN'], provider);
      credentials.vaultToken = process.env.PANDA_VAULT_TOKEN;
    }

    console.log("✓ Vault provider configured");
    console.log(`  URL: ${credentials.vaultUrl}`);
    console.log(`  Mount: ${credentials.vaultMount}`);
    console.log("  Note: Keys will be retrieved from Vault at runtime.");
    console.log("  Ensure your secret is stored at: " + credentials.vaultMount + "/" + credentials.defaultKid);
    return;
  }

  requireEnv(INFISICAL_REQUIRED_ENV, provider);

  // The site URL and the cache TTL do have safe defaults — one is the public
  // service, the other a duration — so unlike the credentials above they are
  // defaulted rather than demanded.
  credentials.infisicalSiteUrl =
    process.env.PANDA_INFISICAL_SITE_URL || 'https://app.infisical.com';
  credentials.infisicalClientId = process.env.PANDA_INFISICAL_CLIENT_ID;
  credentials.infisicalClientSecret = process.env.PANDA_INFISICAL_CLIENT_SECRET;
  credentials.infisicalProjectId = process.env.PANDA_INFISICAL_PROJECT_ID;
  credentials.infisicalEnvironment = process.env.PANDA_INFISICAL_ENVIRONMENT || 'dev';
  credentials.infisicalCacheTTL = process.env.PANDA_INFISICAL_CACHE_TTL || '300';

  console.log("✓ Infisical provider configured");
  console.log(`  Site URL: ${credentials.infisicalSiteUrl}`);
  console.log(`  Project ID: ${credentials.infisicalProjectId}`);
  console.log(`  Environment: ${credentials.infisicalEnvironment}`);
  console.log("  Note: Keys will be retrieved from Infisical at runtime.");
  console.log("  Use 'panda generate' to create keys in Infisical.");
}

/**
 * Quick init mode (non-interactive setup)
 */
async function runQuickInit(options: any): Promise<void> {
  const token = options.token || process.env.PANDA_ACCESS_TOKEN;
  const provider = options.provider || 'local';

  if (!PROVIDERS.includes(provider)) {
    console.error(`Unknown provider: ${provider}. Expected one of: ${PROVIDERS.join(', ')}`);
    process.exit(1);
  }

  // The .panda directory is created after both gates, not before them. It
  // used to be the first thing this function did, so a refused token left an
  // empty .panda behind — a project that looks initialised to anything that
  // only checks for the directory, and does not. panda-php, panda-go and
  // panda-py all write nothing when they refuse, and this now matches.
  try {
    await validateToken(token || '');
  } catch (err: any) {
    console.error(`Token gate failed: ${err.message}`);
    process.exit(1);
  }

  if (isDemoToken(token || '') && !isLocalEnvironment()) {
    console.warn("⚠️ WARNING: You are using the static DEMO TOKEN outside a local development environment.");
    console.warn("Please register your application at the PANDA portal to obtain a per-application live token.");
  }

  console.log("✓ token gate passed");

  const kid = options.kid;
  const credentials: any = {
    token: token,
    provider: provider,
    defaultKid: kid
  };

  // Provider configuration is resolved before anything is written, so a short
  // environment stops init with nothing left behind.
  try {
    if (provider !== 'local') {
      applyProviderEnv(credentials, provider);
    }
  } catch (err: any) {
    console.error(`Provider configuration failed: ${err.message}`);
    process.exit(1);
  }

  const { createPandaDirectory } = require('./commands/utils/panda-dir');
  createPandaDirectory();

  // Only for the local provider: a key generated "for" Vault or Infisical is a
  // second key that nothing reads. panda-php, panda-go and panda-py generate
  // none on this path either.
  if (provider === 'local' && !options.skipKeyGen) {
    await setupLocalProvider(kid, options);
  }

  // Save credentials
  const { writeCredentials } = require('./commands/utils/credentials');
  writeCredentials(credentials);

  console.log("\n✓ PANDA initialization complete!");
  console.log(`Provider: ${provider}`);
  console.log(`Default Key ID: ${kid}`);

  // Exit successfully
  process.exit(0);
}

async function setupLocalProvider(kid: string, options: any): Promise<void> {
  const normalizedKid = kid.replace(/[^A-Za-z0-9]/g, '_').toUpperCase();
  const envVarName = `PANDA_KEY_${normalizedKid}`;

  const keyBytes = crypto.randomBytes(32);
  const keyBase64 = keyBytes.toString('base64');

  const envPath = path.join(process.cwd(), '.env');
  const examplePath = path.join(process.cwd(), '.env.example');

  appendEnv(envPath, envVarName, keyBase64);
  appendEnv(examplePath, envVarName, '');
  appendEnv(envPath, 'PANDA_DEFAULT_KID', kid);
  appendEnv(examplePath, 'PANDA_DEFAULT_KID', '');

  console.log("✓ Local provider configured");
  console.log(`  Generated key for KID: ${kid}`);
  console.log(`  Variable written to .env: ${envVarName}`);
  console.log("  Keep this key secret and secure!");
  console.log("  # From here on, this application never contacts the portal again for");
  console.log("  # encrypt/decrypt/mask, rotate, or migrate — Section 9, Section 14.");
}

/**
 * Append environment variable to .env file
 */
export function appendEnv(filePath: string, name: string, value: string): void {
  let content = '';
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf8');
  }

  const regex = new RegExp(`^${name}=.*\\r?\\n?`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `${name}=${value}\n`);
  } else {
    content += `\n${name}=${value}\n`;
  }

  fs.writeFileSync(filePath, content.trim() + '\n', 'utf8');
}

export function runCli(argv: string[]) {
  const program = new Command();
  program
    .name('panda')
    .description('PANDA CLI Tool for Node.js')
    .version(packageVersion());

  // init command (wizard mode)
  program
    .command('init')
    .description('Initialize PANDA with interactive wizard')
    .option('-k, --kid <type>', 'Key Identifier (quick mode)', 'default-key')
    .option('-t, --token <type>', 'Per-application access token')
    // Defined because it is referenced. The tests used it, and the wizard now
    // tells people to run it when a project is already initialized — while
    // commander rejected it as an unknown option, so the advice pointed at a
    // command that could not be run.
    .option('--reinit', 'Replace an existing configuration', false)
    .option('-q, --quick', 'Skip the wizard; non-interactive setup', false)
    // panda-php, panda-go and panda-py all have this. Without it there is no
    // way to prepare a project for a key that is provisioned later — which is
    // the shape of a deployment where the key arrives from a secret manager
    // and the token gate still has to be satisfied first.
    .option('--skip-key-gen', 'Skip first key generation', false)
    .option(
      '-p, --provider <type>',
      'Key provider: local, vault, or infisical. Implies non-interactive, as --quick does.'
    )
    .action(async (options) => {
      // Determine if non-interactive mode.
      //
      // Naming a provider implies the non-interactive path for the same reason
      // `--quick` does: it is an instruction the wizard cannot accept, since
      // it would ask the question anyway and discard the answer.
      const isNonInteractive = options.quick ||
                               options.provider ||
                               (options.token && options.kid && options.kid !== 'default-key');

      if (isNonInteractive) {
        // Non-interactive mode
        const provider = options.provider || 'local';
        await runQuickInit({ ...options, provider });
      } else {
        // Wizard mode. The token goes with it: the wizard used to be called
        // with no arguments, so --token was read above and then discarded, and
        // the wizard asked for a token that had already been supplied.
        await runInitWizard(
          options.token || process.env.PANDA_ACCESS_TOKEN,
          !!options.reinit
        );
      }
    });

  // generate command
  program
    .command('generate [kid]')
    .description('Generate a new encryption key (interactive or specify kid)')
    .option('-d, --description <text>', 'Key description')
    .option('-y, --yes', 'Skip confirmation prompts (non-interactive)', false)
    .option(
      '-p, --provider <type>',
      "Provider to store the key in. Defaults to the one 'init' recorded."
    )
    .action(async (kid, options) => {
      const exitCode = await runGenerateCommand(kid, options);
      process.exit(exitCode);
    });

  // status command
  program
    .command('status')
    .description('Display PANDA configuration and test connectivity')
    .action(async () => {
      const exitCode = await runStatusCommand();
      process.exit(exitCode);
    });

  // config command
  program
    .command('config')
    .description('Display PANDA configuration details')
    .action(async () => {
      await runConfigCommand();
    });

  // deinit command
  program
    .command('deinit')
    .description('Remove PANDA configuration and .panda directory')
    .option('-f, --force', 'Skip confirmation prompt', false)
    .action(async (options) => {
      await runDeinitCommand(options);
    });

  // rotate-key command
  program
    .command('rotate-key')
    .description('Rotate encryption key')
    .requiredOption('-n, --new-kid <type>', 'New Key Identifier')
    .action((options) => {
      const newKid = options.newKid;
      const normalizedKid = newKid.replace(/[^A-Za-z0-9]/g, '_').toUpperCase();
      const envVarName = `PANDA_KEY_${normalizedKid}`;

      const keyBytes = crypto.randomBytes(32);
      const keyBase64 = keyBytes.toString('base64');

      const envPath = path.join(process.cwd(), '.env');
      const examplePath = path.join(process.cwd(), '.env.example');

      appendEnv(envPath, envVarName, keyBase64);
      appendEnv(examplePath, envVarName, '');

      appendEnv(envPath, 'PANDA_DEFAULT_KID', newKid);
      appendEnv(examplePath, 'PANDA_DEFAULT_KID', '');

      console.log("Key rotated successfully!");
      console.log(`New active write KID: ${newKid}`);
      console.log(`New key written to .env: ${envVarName}`);
    });

  // shred command
  program
    .command('shred <kid>')
    .description('Crypto-shred: permanently delete an encryption key')
    .option('-f, --force', 'Skip confirmation prompt', false)
    .action(async (kid, options) => {
      if (!options.force) {
        const readline = require('readline').createInterface({
          input: process.stdin,
          output: process.stdout
        });
        const answer = await new Promise<string>((resolve) => {
          readline.question(`Are you absolutely sure you want to shred key '${kid}'? ALL data encrypted with this key will be permanently lost! (y/n) `, resolve);
        });
        readline.close();

        if (answer.trim().toLowerCase() !== 'y') {
          console.log("Action cancelled.");
          return;
        }
      }

      const normalizedKid = kid.replace(/[^A-Za-z0-9]/g, '_').toUpperCase();
      const envVarName = `PANDA_KEY_${normalizedKid}`;

      const envPath = path.join(process.cwd(), '.env');
      const examplePath = path.join(process.cwd(), '.env.example');

      let shredded = false;
      for (const filePath of [envPath, examplePath]) {
        if (fs.existsSync(filePath)) {
          let content = fs.readFileSync(filePath, 'utf8');
          const regex = new RegExp(`^${envVarName}=.*\\r?\\n?`, 'm');
          if (regex.test(content)) {
            content = content.replace(regex, '');
            fs.writeFileSync(filePath, content, 'utf8');
            shredded = true;
          }
        }
      }

      if (shredded) {
        console.error(`🔥 Key '${kid}' has been permanently SHREDDED from configuration!`);
      } else {
        console.log(`Key '${kid}' was not found in environment configuration.`);
      }
    });

  // migrate command
  program
    .command('migrate <table-name> <column-name> <kid>')
    .description('Migrate plaintext columns to encrypted envelopes')
    .option('-b, --batch-size <number>', 'Number of rows to process per chunk', '100')
    .option('-d, --delay <number>', 'Delay between chunks in milliseconds', '100')
    .option('-p, --pk <type>', 'Primary key column name', 'id')
    .option('--dry-run', 'Estimate migration scope without modifying data', false)
    .action(async (table, column, kid, options) => {
      const batchSize = parseInt(options.batchSize, 10);
      const delay = parseInt(options.delay, 10);
      const pk = options.pk;
      const dryRun = options.dryRun;

      const connectionType = process.env.DB_CONNECTION || 'mysql';
      const host = process.env.DB_HOST || '127.0.0.1';
      const port = process.env.DB_PORT || (connectionType === 'pgsql' ? '5432' : '3306');
      const database = process.env.DB_DATABASE || '';
      const username = process.env.DB_USERNAME || 'root';
      const password = process.env.DB_PASSWORD || '';

      if (!database) {
        console.error("Error: DB_DATABASE environment variable is not configured.");
        process.exit(1);
      }

      // Initialize crypto layer
      const keyProvider = new LocalKeyProvider();
      const cipher = new FieldCipher(keyProvider);

      console.log(`Migration target: ${table}.${column} using KID: ${kid}`);

      if (connectionType === 'pgsql') {
        const { Client } = require('pg');
        const client = new Client({ host, port: parseInt(port, 10), database, user: username, password });
        await client.connect();

        try {
          // Checkpoint table creation
          await client.query(`
            CREATE TABLE IF NOT EXISTS panda_migration_state (
              id SERIAL PRIMARY KEY,
              table_name VARCHAR(128) NOT NULL,
              column_name VARCHAR(128) NOT NULL,
              last_processed_id VARCHAR(255) NOT NULL,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              CONSTRAINT unique_target UNIQUE (table_name, column_name)
            )
          `);

          // Fetch checkpoint
          const checkRes = await client.query('SELECT last_processed_id FROM panda_migration_state WHERE table_name = $1 AND column_name = $2', [table, column]);
          let checkpoint = checkRes.rows.length > 0 ? checkRes.rows[0].last_processed_id : null;
          console.log(`Last processed primary key ID: ${checkpoint || 'None'}`);

          if (dryRun) {
            console.log("[DRY RUN] Estimating scope...");
            const countSql = checkpoint ? `SELECT COUNT(*) FROM ${table} WHERE ${pk} > $1` : `SELECT COUNT(*) FROM ${table}`;
            const countParams = checkpoint ? [checkpoint] : [];
            const countRes = await client.query(countSql, countParams);
            const remaining = parseInt(countRes.rows[0].count, 10);
            console.log(`Total remaining rows to scan: ${remaining}`);
            await client.end();
            return;
          }

          let lastId = checkpoint;
          let totalProcessed = 0;
          let totalEncrypted = 0;

          while (true) {
            const selectSql = lastId ? `SELECT ${pk}, ${column} FROM ${table} WHERE ${pk} > $1 ORDER BY ${pk} ASC LIMIT $2` : `SELECT ${pk}, ${column} FROM ${table} ORDER BY ${pk} ASC LIMIT $1`;
            const selectParams = lastId ? [lastId, batchSize] : [batchSize];
            const selectRes = await client.query(selectSql, selectParams);
            const rows = selectRes.rows;

            if (rows.length === 0) {
              break;
            }

            await client.query('BEGIN');
            try {
              let currentBatchLastId = lastId;
              for (const row of rows) {
                currentBatchLastId = String(row[pk]);
                const val = row[column];

                const isAlreadyEncrypted = val && typeof val === 'string' && val.startsWith('{') && val.includes('"v":');
                if (isAlreadyEncrypted) continue;

                if (val !== null && val !== undefined && val !== '') {
                  const envelope = await cipher.encrypt(val, kid, 'migration-cli', `${table}.${column}`);
                  await client.query(`UPDATE ${table} SET ${column} = $1 WHERE ${pk} = $2`, [envelope.toJson(), row[pk]]);
                  totalEncrypted++;
                }
              }

              lastId = currentBatchLastId;
              await client.query(`
                INSERT INTO panda_migration_state (table_name, column_name, last_processed_id)
                VALUES ($1, $2, $3)
                ON CONFLICT (table_name, column_name)
                DO UPDATE SET last_processed_id = EXCLUDED.last_processed_id, updated_at = CURRENT_TIMESTAMP
              `, [table, column, lastId]);

              await client.query('COMMIT');
            } catch (e) {
              await client.query('ROLLBACK');
              throw e;
            }

            totalProcessed += rows.length;
            console.log(`Processed ${totalProcessed} rows... Encrypted: ${totalEncrypted}`);

            if (delay > 0) {
              await new Promise((r) => setTimeout(r, delay));
            }
          }

          console.log(`Migration finished! Total rows processed: ${totalProcessed}, Encrypted: ${totalEncrypted}`);
        } finally {
          await client.end();
        }
      } else {
        // Default to MySQL
        const mysql = require('mysql2/promise');
        const connection = await mysql.createConnection({ host, port: parseInt(port, 10), database, user: username, password });

        try {
          await connection.query(`
            CREATE TABLE IF NOT EXISTS panda_migration_state (
              id INT AUTO_INCREMENT PRIMARY KEY,
              table_name VARCHAR(128) NOT NULL,
              column_name VARCHAR(128) NOT NULL,
              last_processed_id VARCHAR(255) NOT NULL,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              UNIQUE KEY unique_target (table_name, column_name)
            )
          `);

          const [checkRows]: any = await connection.query('SELECT last_processed_id FROM panda_migration_state WHERE table_name = ? AND column_name = ?', [table, column]);
          let checkpoint = checkRows.length > 0 ? checkRows[0].last_processed_id : null;
          console.log(`Last processed primary key ID: ${checkpoint || 'None'}`);

          if (dryRun) {
            console.log("[DRY RUN] Estimating scope...");
            const countSql = checkpoint ? `SELECT COUNT(*) as count FROM ${table} WHERE ${pk} > ?` : `SELECT COUNT(*) as count FROM ${table}`;
            const countParams = checkpoint ? [checkpoint] : [];
            const [countRows]: any = await connection.query(countSql, countParams);
            const remaining = countRows[0].count;
            console.log(`Total remaining rows to scan: ${remaining}`);
            await connection.end();
            return;
          }

          let lastId = checkpoint;
          let totalProcessed = 0;
          let totalEncrypted = 0;

          while (true) {
            const selectSql = lastId ? `SELECT ${pk}, ${column} FROM ${table} WHERE ${pk} > ? ORDER BY ${pk} ASC LIMIT ?` : `SELECT ${pk}, ${column} FROM ${table} ORDER BY ${pk} ASC LIMIT ?`;
            const selectParams = lastId ? [lastId, batchSize] : [batchSize];
            const [rows]: any = await connection.query(selectSql, selectParams);

            if (rows.length === 0) {
              break;
            }

            await connection.beginTransaction();
            try {
              let currentBatchLastId = lastId;
              for (const row of rows) {
                currentBatchLastId = String(row[pk]);
                const val = row[column];

                const isAlreadyEncrypted = val && typeof val === 'string' && val.startsWith('{') && val.includes('"v":');
                if (isAlreadyEncrypted) continue;

                if (val !== null && val !== undefined && val !== '') {
                  const envelope = await cipher.encrypt(val, kid, 'migration-cli', `${table}.${column}`);
                  await connection.query(`UPDATE ${table} SET ${column} = ? WHERE ${pk} = ?`, [envelope.toJson(), row[pk]]);
                  totalEncrypted++;
                }
              }

              lastId = currentBatchLastId;
              await connection.query(`
                INSERT INTO panda_migration_state (table_name, column_name, last_processed_id)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE last_processed_id = ?
              `, [table, column, lastId, lastId]);

              await connection.commit();
            } catch (e) {
              await connection.rollback();
              throw e;
            }

            totalProcessed += rows.length;
            console.log(`Processed ${totalProcessed} rows... Encrypted: ${totalEncrypted}`);

            if (delay > 0) {
              await new Promise((r) => setTimeout(r, delay));
            }
          }

          console.log(`Migration finished! Total rows processed: ${totalProcessed}, Encrypted: ${totalEncrypted}`);
        } finally {
          await connection.end();
        }
      }
    });

  program.parse(argv);
}
