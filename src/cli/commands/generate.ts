import * as crypto from 'crypto';
import * as readline from 'readline';
import { readCredentials } from './utils/credentials';
import { addKeyToMetadata } from './utils/panda-dir';
import { appendEnv } from '../commander';
import * as path from 'path';

/**
 * Generate a new encryption key and store it in the configured provider
 */
export async function runGenerateCommand(kid: string, options: any): Promise<number> {
  const credentials = readCredentials();
  const nonInteractive = options.yes || options.keystore;

  // Check if initialized
  if (!credentials) {
    console.error('Error: PANDA not initialized. Run "panda init" first.');
    return 1;
  }

  if (!kid) {
    if (nonInteractive) {
      console.error('Error: Key ID is required in non-interactive mode. Use: panda generate <kid> --yes');
      return 1;
    }

    // Interactive mode
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (prompt: string): Promise<string> => {
      return new Promise((resolve) => {
        rl.question(prompt, resolve);
      });
    };

    console.log('\n🔑 PANDA Key Generation');
    console.log('=======================\n');

    kid = await question('Enter Key ID (e.g., nik-key, health-data-key): ');
    const description = await question('Description (optional): ');

    rl.close();

    if (!kid) {
      console.error('Error: Key ID is required');
      return 1;
    }
  }

  // Validate key ID format
  if (!/^[a-zA-Z0-9_-]+$/.test(kid)) {
    console.error('Error: Key ID must contain only alphanumeric characters, hyphens, and underscores');
    return 1;
  }

  console.log(`\nGenerating key for KID: ${kid}`);

  const keyBytes = crypto.randomBytes(32);
  const keyBase64 = keyBytes.toString('base64');

  // Use keystore override if provided, otherwise use credentials provider
  const provider = options.keystore || credentials?.provider || 'local';

  switch (provider) {
    case 'local':
      await storeLocalKey(kid, keyBase64);
      break;

    case 'vault':
      await storeVaultKey(kid, keyBase64, credentials);
      break;

    case 'infisical':
      await storeInfisicalKey(kid, keyBase64, credentials);
      break;

    default:
      // Fallback to local
      console.log('No provider configured, using local storage');
      await storeLocalKey(kid, keyBase64);
      break;
  }

  console.log(`\n✓ Key '${kid}' generated successfully!`);
  console.log('\nTo use this key:');
  console.log(`  cipher.encrypt(value, '${kid}', context, field)`);

  // Record the key in keys.json, which is where key metadata lives.
  //
  // This used to be written into credentials.keys instead — the same
  // information, in a second place, next to the secrets. keys.json was
  // created by every init, read by status, had its own read, write and
  // add API, and was never written to by anything. Generate is what it was
  // for.
  if (credentials) {
    const location =
      provider === 'vault'
        ? `${credentials.vaultMount || 'secret'}/${kid}`
        : provider === 'infisical'
          ? `${credentials.infisicalProjectId || 'project'}/${credentials.infisicalEnvironment || 'dev'}`
          : `PANDA_KEY_${kid.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`;

    try {
      addKeyToMetadata(kid, provider, location);
    } catch (err) {
      // Generating the same kid again. The metadata is already recorded and
      // has not changed; addKeyToMetadata refuses duplicates rather than
      // silently doing nothing, which is right for a store and not what a
      // re-run of generate should fail on.
      if (!String(err).includes('already exists')) throw err;
    }
  }

  return 0;
}

async function storeLocalKey(kid: string, keyBase64: string): Promise<void> {
  const normalizedKid = kid.replace(/[^A-Za-z0-9]/g, '_').toUpperCase();
  const envVarName = `PANDA_KEY_${normalizedKid}`;

  const envPath = path.join(process.cwd(), '.env');
  const examplePath = path.join(process.cwd(), '.env.example');

  appendEnv(envPath, envVarName, keyBase64);
  appendEnv(examplePath, envVarName, '');

  console.log(`✓ Key stored in .env as ${envVarName}`);
  console.log('⚠️  IMPORTANT: Commit .env to your secret management system!');
}

async function storeVaultKey(kid: string, keyBase64: string, credentials: any): Promise<void> {
  console.log(`\nStoring key in HashiCorp Vault...`);
  console.log(`Path: ${credentials.vaultMount}/${kid}`);
  console.log('Note: Manual setup may be required. Use Vault CLI or UI to store:');
  console.log(`  vault kv put ${credentials.vaultMount}/${kid} value=${keyBase64}`);
}

async function storeInfisicalKey(kid: string, keyBase64: string, credentials: any): Promise<void> {
  const https = require('https');
  const http = require('http');

  console.log(`\nStoring key in Infisical...`);

  // First, authenticate
  const authUrl = `${credentials.infisicalSiteUrl}/api/v1/auth/universal-auth/login`;
  const authPayload = {
    clientId: credentials.infisicalClientId,
    clientSecret: credentials.infisicalClientSecret
  };

  let authSuccess = false;
  let accessToken = '';

  try {
    accessToken = await new Promise<string>((resolve, reject) => {
      const client = authUrl.startsWith('https') ? https : http;

      const req = client.request(authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }, (res: any) => {
        let body = '';
        res.on('data', (chunk: any) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Authentication failed (HTTP ${res.statusCode})`));
            return;
          }
          try {
            const data = JSON.parse(body);
            resolve(data.accessToken);
          } catch (e) {
            reject(new Error('Failed to parse auth response'));
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify(authPayload));
      req.end();
    });
    authSuccess = true;
  } catch (error: any) {
    console.log(`⚠️  Authentication failed: ${error.message}`);
  }

  if (authSuccess) {
    // Create/update secret
    const apiUrl = `${credentials.infisicalSiteUrl}/api/v3/secrets`;
    const secretPayload = {
      projectId: credentials.infisicalProjectId,
      environment: credentials.infisicalEnvironment,
      secretPath: kid,
      secretValue: keyBase64,
      type: 'shared'
    };

    try {
      await new Promise<void>((resolve, reject) => {
        const client = apiUrl.startsWith('https') ? https : http;

        const req = client.request(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          }
        }, (res: any) => {
          let body = '';
          res.on('data', (chunk: any) => { body += chunk; });
          res.on('end', () => {
            if (res.statusCode === 200 || res.statusCode === 201) {
              console.log(`✓ Key stored in Infisical at path: ${kid}`);
              resolve();
            } else {
              console.log(`⚠️  Failed to store in Infisical (HTTP ${res.statusCode})`);
              reject(new Error(`HTTP ${res.statusCode}`));
            }
          });
        });

        req.on('error', reject);
        req.write(JSON.stringify(secretPayload));
        req.end();
      });
      return;
    } catch (error: any) {
      console.log(`⚠️  Request failed: ${error.message}`);
    }
  }

  // If we get here, auth or store failed - show manual instructions
  console.log('You may need to create the secret manually in the Infisical UI');
  console.log(`Path: ${kid}`);
  console.log(`Value (base64): ${keyBase64}`);
}
