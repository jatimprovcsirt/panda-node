import * as fs from 'fs';
import * as path from 'path';
import { readCredentials, PandaCredentials } from './utils/credentials';
import { readKeysMetadata } from './utils/panda-dir';

/**
 * Display PANDA configuration details
 */
export async function runConfigCommand(): Promise<void> {
  console.log('\n🐼 PANDA Configuration');
  console.log('======================\n');

  const credentials = readCredentials();

  if (!credentials) {
    console.log('⚠️  No PANDA configuration found. Run "panda init" first.');
    return;
  }

  // Display provider configuration
  console.log('Provider Configuration:');
  console.log('-----------------------');
  console.log(`Provider: ${credentials.provider}`);

  switch (credentials.provider) {
    case 'local':
      console.log('  Type: Environment Variables');
      console.log('  Storage: .env file');
      console.log('  Keys stored as: PANDA_KEY_<KID>');
      break;

    case 'vault':
      console.log('  Type: HashiCorp Vault');
      console.log(`  URL: ${credentials.vaultUrl}`);
      console.log(`  Mount Path: ${credentials.vaultMount || 'secret'}`);
      console.log(`  Token: ${credentials.vaultToken ? '***configured***' : 'not set'}`);
      console.log('  Keys stored at: <mount>/<kid>');
      break;

    case 'infisical':
      console.log('  Type: Infisical Secrets Manager');
      console.log(`  Site URL: ${credentials.infisicalSiteUrl}`);
      console.log(`  Project ID: ${credentials.infisicalProjectId}`);
      console.log(`  Environment: ${credentials.infisicalEnvironment}`);
      console.log(`  Client ID: ${credentials.infisicalClientId || 'not set'}`);
      console.log(`  Client Secret: ${credentials.infisicalClientSecret ? '***configured***' : 'not set'}`);
      console.log(`  Cache TTL: ${credentials.infisicalCacheTTL || 300}s`);
      console.log('  Keys stored as: secrets in Infisical');
      break;
  }

  // Default Key ID
  if (credentials.defaultKid) {
    console.log(`\nDefault Key ID: ${credentials.defaultKid}`);
  }

  // List configured keys, from keys.json — the record generate writes and
  // status reads. This used to read credentials.keys, a second copy of the
  // same information that nothing kept in step with the first.
  const keysData = readKeysMetadata();
  if (keysData && keysData.keys.length > 0) {
    console.log('\nConfigured Keys:');
    console.log('-----------------');
    for (const key of keysData.keys) {
      console.log(`  ${key.kid}`);
      console.log(`    Created: ${key.created}`);
      console.log(`    Provider: ${key.provider}`);
      console.log(`    Location: ${key.location}`);
    }
  }

  // Display .env.example template
  console.log('\nEnvironment Variables Template:');
  console.log('-------------------------------');

  switch (credentials.provider) {
    case 'local':
      console.log('# Local Key Provider');
      console.log('PANDA_KEY_PROVIDER_DRIVER=local');
      console.log('PANDA_DEFAULT_KID=default-key');
      console.log('PANDA_KEY_DEFAULT_KEY=<base64-encoded-key>');
      break;

    case 'vault':
      console.log('# Vault Key Provider');
      console.log('PANDA_KEY_PROVIDER_DRIVER=vault');
      console.log('PANDA_DEFAULT_KID=default-key');
      console.log('PANDA_VAULT_URL=http://127.0.0.1:8200');
      console.log('PANDA_VAULT_TOKEN=<vault-token>');
      console.log('PANDA_VAULT_MOUNT_PATH=secret');
      break;

    case 'infisical':
      console.log('# Infisical Key Provider');
      console.log('PANDA_KEY_PROVIDER_DRIVER=infisical');
      console.log('PANDA_DEFAULT_KID=default-key');
      console.log(`PANDA_INFISICAL_SITE_URL=${credentials.infisicalSiteUrl}`);
      console.log(`PANDA_INFISICAL_CLIENT_ID=${credentials.infisicalClientId || '<client-id>'}`);
      console.log('PANDA_INFISICAL_CLIENT_SECRET=<client-secret>');
      console.log(`PANDA_INFISICAL_PROJECT_ID=${credentials.infisicalProjectId}`);
      console.log(`PANDA_INFISICAL_ENVIRONMENT=${credentials.infisicalEnvironment}`);
      console.log(`PANDA_INFISICAL_CACHE_TTL=${credentials.infisicalCacheTTL || 300}`);
      break;
  }

  // Current working directory info
  console.log('\nWorking Directory:');
  console.log('-------------------');
  console.log(`  Path: ${process.cwd()}`);

  const pandaPath = path.join(process.cwd(), '.panda');
  if (fs.existsSync(pandaPath)) {
    console.log(`  .panda directory: ✓ exists`);
  } else {
    console.log(`  .panda directory: ✗ not found`);
  }

  console.log();
}
