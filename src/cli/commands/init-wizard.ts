import * as readline from 'readline';
import { writeCredentials, readCredentials, PandaCredentials } from './utils/credentials';
import { appendEnv } from '../commander';
import { TOKEN_PATTERN } from '../../crypto/tokenValidator';
import * as crypto from 'crypto';
import * as path from 'path';

/**
 * Interactive wizard for initializing PANDA with different key providers.
 *
 * `presetToken` is what the caller passed to `--token`. This function used to
 * take no arguments, so the option was read by the command and then dropped —
 * the wizard asked for a token regardless, and there was no way to answer a
 * question that had already been answered.
 */
export async function runInitWizard(presetToken?: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  };

  console.log('\n🐼 PANDA Initialization Wizard');
  console.log('==============================\n');

  // Step 1: Access token — asked for only if it was not already given.
  console.log('Step 1: Authentication');
  console.log('---------------------');

  let token = presetToken || '';
  if (token) {
    console.log('Using the token passed with --token.');
  } else {
    token = await question('Enter your PANDA access token (or press Enter to skip validation): ');
  }

  if (token) {
    // The pattern comes from the shared validator rather than being written
    // out again here. It was written out again, and the two had drifted: this
    // copy accepted 48 hex characters where the validator accepts 48 or 64, so
    // a token the rest of the tool considers valid was rejected here.
    if (!TOKEN_PATTERN.test(token)) {
      console.log(
        '⚠️  Warning: Token format appears invalid. Expected: panda_(demo|live)_ ' +
          'followed by 48 or 64 hex characters.'
      );
      const continueAnyway = await question('Continue anyway? (y/n): ');
      if (continueAnyway.toLowerCase() !== 'y') {
        rl.close();
        return;
      }
    } else {
      console.log('✓ Token format validated');
    }
  }

  // Step 2: Select key provider
  console.log('\nStep 2: Key Provider Selection');
  console.log('-------------------------------');
  console.log('Where should encryption keys be stored?');
  console.log('  1. Local (environment variables)');
  console.log('  2. HashiCorp Vault');
  console.log('  3. Infisical');

  const providerChoice = await question('Enter choice (1-3) [default: 1]: ');
  const providerType = providerChoice || '1';

  let credentials: PandaCredentials = {
    token: token || undefined,
    provider: 'local'
  };

  switch (providerType) {
    case '2':
      // Vault configuration
      credentials.provider = 'vault';
      console.log('\nConfiguring HashiCorp Vault...');
      credentials.vaultUrl = await question('Vault URL [default: http://127.0.0.1:8200]: ') || 'http://127.0.0.1:8200';

      // Authentication method selection
      console.log('\nSelect Vault authentication method:');
      console.log('  1. AppRole (Recommended - Auto-renewal, production-ready)');
      console.log('  2. Token (Advanced - Manual renewal)');
      const authChoice = await question('Choose method [default: 1]: ') || '1';

      if (authChoice === '1') {
        // AppRole authentication
        credentials.vaultAuthMethod = 'approle';
        console.log('\nUsing AppRole authentication (auto-renewal enabled)');
        credentials.vaultRoleId = await question('Role ID: ');
        credentials.vaultSecretId = await question('Secret ID: ');

        // Optional: Token TTL
        console.log('\nToken TTL (Optional)');
        console.log('  Token lifetime before auto-renewal. Default: 3600s (1 hour)');
        console.log('  Press Enter to use default, or enter custom value (300-86400 seconds)');
        const tokenTTL = await question('Token TTL in seconds [default: 3600]: ') || '3600';
        credentials.vaultTokenTTL = tokenTTL;
      } else {
        // Token authentication
        credentials.vaultAuthMethod = 'token';
        console.log('\nUsing Token authentication (manual renewal required)');
        credentials.vaultToken = await question('Vault Token: ');
      }

      credentials.vaultMount = await question('Mount path [default: secret]: ') || 'secret';
      break;

    case '3':
      // Infisical configuration
      credentials.provider = 'infisical';
      console.log('\nConfiguring Infisical...');
      credentials.infisicalSiteUrl = await question('Infisical Site URL [default: https://app.infisical.com]: ') || 'https://app.infisical.com';
      credentials.infisicalClientId = await question('Machine Identity Client ID: ');
      credentials.infisicalClientSecret = await question('Machine Identity Client Secret: ');
      credentials.infisicalProjectId = await question('Project ID: ');
      credentials.infisicalEnvironment = await question('Environment [default: dev]: ') || 'dev';
      credentials.infisicalCacheTTL = await question('Cache TTL in seconds [default: 300]: ') || '300';
      break;

    default:
      credentials.provider = 'local';
      break;
  }

  // Step 3: Default Key ID
  console.log('\nStep 3: Default Key Configuration');
  console.log('------------------------------------');
  const defaultKid = await question('Default Key ID [default: default-key]: ') || 'default-key';

  // Step 4: Generate/Store key
  console.log('\nStep 4: Key Generation');
  console.log('----------------------');

  if (credentials.provider === 'local') {
    // Generate local key
    const keyBytes = crypto.randomBytes(32);
    const keyBase64 = keyBytes.toString('base64');
    const normalizedKid = defaultKid.replace(/[^A-Za-z0-9]/g, '_').toUpperCase();
    const envVarName = `PANDA_KEY_${normalizedKid}`;

    const envPath = path.join(process.cwd(), '.env');
    const examplePath = path.join(process.cwd(), '.env.example');

    appendEnv(envPath, envVarName, keyBase64);
    appendEnv(examplePath, envVarName, '');
    appendEnv(envPath, 'PANDA_DEFAULT_KID', defaultKid);
    appendEnv(examplePath, 'PANDA_DEFAULT_KID', '');

    console.log(`✓ Local key generated and written to .env`);
    console.log(`  Variable: ${envVarName}`);
  } else if (credentials.provider === 'vault') {
    console.log('For Vault, keys will be retrieved at runtime using the configured path.');
    console.log('Ensure your secret is stored at: ' + credentials.vaultMount + '/<key-id>');
  } else if (credentials.provider === 'infisical') {
    console.log('For Infisical, keys will be retrieved at runtime from the project.');
    console.log('Use "panda generate" command to create a key in Infisical.');
  }

  // Save credentials to .panda directory
  credentials.defaultKid = defaultKid;
  writeCredentials(credentials);

  // Step 5: Framework selection
  console.log('\nStep 5: Framework Integration');
  console.log('-----------------------------');
  console.log('Select your framework (for auto-configuration):');
  console.log('  1. Laravel (PHP)');
  console.log('  2. NestJS (Node.js)');
  console.log('  3. CodeIgniter (PHP)');
  console.log('  4. Express (Node.js)');
  console.log('  5. None/Skip');

  const frameworkChoice = await question('Enter choice (1-5) [default: 5]: ');

  switch (frameworkChoice) {
    case '1':
      console.log('\nFor Laravel, add these to your .env:');
      console.log(`PANDA_KEY_PROVIDER_DRIVER=${credentials.provider}`);
      if (credentials.provider === 'vault') {
        console.log(`PANDA_VAULT_URL=${credentials.vaultUrl}`);
        console.log(`PANDA_VAULT_TOKEN=${credentials.vaultToken}`);
        console.log(`PANDA_VAULT_MOUNT_PATH=${credentials.vaultMount}`);
      } else if (credentials.provider === 'infisical') {
        console.log(`PANDA_INFISICAL_SITE_URL=${credentials.infisicalSiteUrl}`);
        console.log(`PANDA_INFISICAL_CLIENT_ID=${credentials.infisicalClientId}`);
        console.log(`PANDA_INFISICAL_CLIENT_SECRET=***`);
        console.log(`PANDA_INFISICAL_PROJECT_ID=${credentials.infisicalProjectId}`);
        console.log(`PANDA_INFISICAL_ENVIRONMENT=${credentials.infisicalEnvironment}`);
      }
      console.log(`PANDA_DEFAULT_KID=${defaultKid}`);
      break;

    case '2':
      console.log('\nFor NestJS, use PandaModule.forRoot() in your app.module.ts:');
      console.log(`PandaModule.forRoot({`);
      console.log(`  keyProvider: '${credentials.provider}',`);
      if (credentials.provider === 'infisical') {
        console.log(`  infisical: {`);
        console.log(`    siteUrl: '${credentials.infisicalSiteUrl}',`);
        console.log(`    clientId: '${credentials.infisicalClientId}',`);
        console.log(`    clientSecret: '***',`);
        console.log(`    projectId: '${credentials.infisicalProjectId}',`);
        console.log(`    environment: '${credentials.infisicalEnvironment}'`);
        console.log(`  }`);
      }
      console.log(`})`);
      break;

    default:
      break;
  }

  console.log('\n✓ PANDA initialization complete!\n');
  console.log('Next steps:');
  console.log('  - Use "panda generate <kid>" to create encryption keys');
  console.log('  - Use "panda status" to verify configuration');
  console.log('  - Use "panda migrate" to encrypt existing data\n');

  rl.close();
}
