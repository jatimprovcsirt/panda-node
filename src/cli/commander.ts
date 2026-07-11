import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { LocalKeyProvider } from '../crypto/keys';
import { FieldCipher } from '../crypto/cipher';
import { Envelope } from '../envelope/envelope';
import { validateToken, isDemoToken, isLocalEnvironment } from '../crypto/tokenValidator';

export function runCli(argv: string[]) {
  const program = new Command();
  program
    .name('panda')
    .description('PANDA CLI Tool for Node.js')
    .version('0.1.0');

  // init command
  program
    .command('init')
    .description('Initialize local PANDA master key')
    .option('-k, --kid <type>', 'Key Identifier', 'default-key')
    .option('-t, --token <type>', 'Per-application access token (falls back to PANDA_ACCESS_TOKEN env var)')
    .action((options) => {
      const token = options.token || process.env.PANDA_ACCESS_TOKEN;

      try {
        validateToken(token || '');
      } catch (err: any) {
        console.error(`Token gate failed: ${err.message}`);
        process.exit(1);
      }

      if (isDemoToken(token || '') && !isLocalEnvironment()) {
        console.warn("⚠️ WARNING: You are using the static DEMO TOKEN outside a local development environment.");
        console.warn("Please register your application at the PANDA portal to obtain a per-application live token.");
      }

      console.log("✓ token gate passed (format check, pre-portal — Section 14.2)");

      const kid = options.kid;
      const normalizedKid = kid.replace(/[^A-Za-z0-9]/g, '_').toUpperCase();
      const envVarName = `PANDA_KEY_${normalizedKid}`;

      const keyBytes = crypto.randomBytes(32);
      const keyBase64 = keyBytes.toString('base64');

      const envPath = path.join(process.cwd(), '.env');
      const examplePath = path.join(process.cwd(), '.env.example');

      appendEnv(envPath, envVarName, keyBase64);
      appendEnv(examplePath, envVarName, '');

      console.log("✓ local master key generated, written to .env");
      console.log(`Generated key for KID: ${kid}`);
      console.log(`Variable written to .env: ${envVarName}`);
      console.log("Keep this key secret and secure!");
      console.log("# From here on, this application never contacts the portal again for");
      console.log("# encrypt/decrypt/mask, rotate, or migrate — Section 9, Section 14.");
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

function appendEnv(filePath: string, name: string, value: string): void {
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
