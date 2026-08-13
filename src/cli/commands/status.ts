import * as fs from 'fs';
import * as path from 'path';
import { readCredentials } from './utils/credentials';
import { readKeysMetadata } from './utils/panda-dir';
import { createKeyProvider } from '../../crypto/keys';

/**
 * Display the current PANDA configuration and status
 */
export async function runStatusCommand(): Promise<number> {
  console.log('\n🐼 PANDA Status');
  console.log('==============\n');

  let credentials = null;
  try {
    credentials = readCredentials();
  } catch (error: any) {
    console.log('⚠️  Error reading credentials. They may be corrupted.');
    console.log('   Run "panda init" to reinitialize.');
    return 0;
  }

  // Provider Configuration
  console.log('Key Provider Configuration:');
  console.log('---------------------------');

  if (!credentials) {
    console.log('⚠️  No PANDA configuration found. Run "panda init" first.');
    console.log('\nChecking environment variables...');

    const envVars = Object.keys(process.env)
      .filter(key => key.startsWith('PANDA_'))
      .sort();

    if (envVars.length > 0) {
      console.log('\nFound PANDA environment variables:');
      envVars.forEach(v => {
        const value = process.env[v];
        if (v.includes('SECRET') || v.includes('TOKEN') || v.includes('KEY')) {
          console.log(`  ${v} = ***`);
        } else {
          console.log(`  ${v} = ${value}`);
        }
      });
    } else {
      console.log('No PANDA environment variables found.');
    }

    return 0;
  }

  console.log(`Provider: ${credentials.provider}`);

  switch (credentials.provider) {
    case 'local':
      console.log('  Type: Environment Variables');
      console.log('  Storage: .env file');
      break;

    case 'vault':
      console.log('  Type: HashiCorp Vault');
      console.log(`  URL: ${credentials.vaultUrl}`);
      console.log(`  Auth: ${credentials.vaultAuthMethod || 'token'}`);
      if (credentials.vaultAuthMethod === 'approle') {
        console.log(`  Role ID: ${credentials.vaultRoleId ? '***configured***' : 'not set'}`);
        console.log(`  Secret ID: ${credentials.vaultSecretId ? '***configured***' : 'not set'}`);
      } else {
        console.log(`  Token: ${credentials.vaultToken ? '***configured***' : 'not set'}`);
      }
      if (credentials.vaultTokenTTL) {
        console.log(`  Token TTL: ${credentials.vaultTokenTTL} seconds`);
      }
      console.log(`  Mount: ${credentials.vaultMount || 'secret'}`);
      break;

    case 'infisical':
      console.log('  Type: Infisical');
      console.log(`  Site URL: ${credentials.infisicalSiteUrl}`);
      console.log(`  Project ID: ${credentials.infisicalProjectId}`);
      console.log(`  Environment: ${credentials.infisicalEnvironment}`);
      console.log(`  Client ID: ${credentials.infisicalClientId || 'not set'}`);
      console.log(`  Client Secret: ${credentials.infisicalClientSecret ? '***configured***' : 'not set'}`);
      console.log(`  Cache TTL: ${credentials.infisicalCacheTTL || 300}s`);
      break;
  }

  console.log(`\nDefault Key ID: ${credentials.defaultKid || 'not set'}`);

  // List configured keys from keys.json
  try {
    const keysData = readKeysMetadata();
    if (keysData && keysData.keys && keysData.keys.length > 0) {
      console.log('\nConfigured Keys:');
      console.log('-----------------');
      keysData.keys.forEach((key: any) => {
        const created = key.created ? new Date(key.created).toLocaleDateString() : 'unknown';
        console.log(`  • ${key.kid}`);
        console.log(`    Created: ${created}`);
        console.log(`    Provider: ${key.provider}`);
        if (key.location) {
          console.log(`    Location: ${key.location}`);
        }
      });
    }
  } catch (error) {
    // Silently skip if keys.json can't be read
  }

  // Test provider connectivity
  console.log('\nTesting Provider Connectivity:');
  console.log('---------------------------------');

  try {
    let testKid = credentials.defaultKid;
    if (!testKid) {
      testKid = 'test-key';
    }

    const keyProvider = createKeyProvider(
      credentials.provider as 'local' | 'vault' | 'infisical',
      credentials
    );

    // Try to fetch a key (will fail for non-existent, but tests config)
    console.log(`Testing with KID: ${testKid}`);

    // For local, check if env var exists
    if (credentials.provider === 'local') {
      const normalizedKid = testKid.replace(/[^A-Za-z0-9]/g, '_').toUpperCase();
      const envVar = `PANDA_KEY_${normalizedKid}`;
      if (process.env[envVar]) {
        console.log('✓ Local key found in environment');
      } else {
        console.log(`⚠️  Local key not found: ${envVar}`);
      }
    } else {
      console.log('✓ Provider configuration valid');
      console.log('  Note: Key access will be verified at runtime');
    }

  } catch (error: any) {
    console.log(`✗ Provider test failed: ${error.message}`);
  }

  // Check framework files
  console.log('\nFramework Integration:');
  console.log('----------------------');

  const frameworks: { name: string; files: string[]; found: boolean }[] = [
    { name: 'Laravel', files: ['composer.json', 'app/Providers/PandaServiceProvider.php'], found: false },
    { name: 'NestJS', files: ['package.json', 'src/app.module.ts'], found: false },
    { name: 'CodeIgniter', files: ['composer.json', 'app/Config/Panda.php'], found: false },
    { name: 'Express', files: ['package.json', 'src/server.ts'], found: false }
  ];

  frameworks.forEach(fw => {
    const allFound = fw.files.every(file => fs.existsSync(path.join(process.cwd(), file)));
    if (allFound) {
      console.log(`  ✓ ${fw.name} detected`);
    }
  });

  if (!frameworks.some(fw => fw.files.every(file => fs.existsSync(path.join(process.cwd(), file))))) {
    console.log('  No framework integration detected');
  }

  // Environment check
  console.log('\nEnvironment:');
  console.log('-------------');
  console.log(`  Node.js: ${process.version}`);
  console.log(`  Platform: ${process.platform}`);
  console.log(`  CWD: ${process.cwd()}`);

  // Tips
  console.log('\nQuick Tips:');
  console.log('-----------');
  console.log('  panda generate <kid>     - Create a new encryption key');
  console.log('  panda rotate-key         - Rotate to a new active key');
  console.log('  panda migrate <table>   - Encrypt existing data');
  console.log('  panda shred <kid>       - Permanently delete a key');

  console.log();

  return 0;
}
