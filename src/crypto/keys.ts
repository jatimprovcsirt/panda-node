import { KeyNotFoundError } from '../errors';
import * as http from 'http';
import * as https from 'https';

export interface KeyProvider {
  getKey(kid: string): Promise<Buffer>;
}

export class LocalKeyProvider implements KeyProvider {
  private keys: Map<string, Buffer> = new Map();

  constructor(initialKeys: Record<string, Buffer> = {}) {
    for (const [kid, key] of Object.entries(initialKeys)) {
      this.keys.set(kid, key);
    }
  }

  setKey(kid: string, keyBytes: Buffer): void {
    this.keys.set(kid, keyBytes);
  }

  async getKey(kid: string): Promise<Buffer> {
    // 1. Check memory map
    if (this.keys.has(kid)) {
      return this.keys.get(kid)!;
    }

    // 2. Check environment variables
    const normalizedKid = kid.replace(/[^A-Za-z0-9]/g, '_').toUpperCase();
    const envKeyName = `PANDA_KEY_${normalizedKid}`;

    const val = process.env[`PANDA_KEY_${kid}`] || process.env[envKeyName];

    if (!val) {
      throw new KeyNotFoundError(`Encryption key not found for kid: ${kid} (expected env variable: ${envKeyName})`);
    }

    const keyBuf = Buffer.from(val, 'base64');
    if (keyBuf.length !== 32) {
      throw new KeyNotFoundError(`Invalid key format for kid: ${kid}. Key must be base64-encoded and decode to exactly 32 bytes.`);
    }

    return keyBuf;
  }
}

export class VaultKeyProvider implements KeyProvider {
  private cache: Map<string, Buffer> = new Map();
  private vaultUrl: string;
  private vaultToken: string;
  private mountPath: string;

  constructor(vaultUrl: string, vaultToken: string, mountPath: string = 'secret') {
    this.vaultUrl = vaultUrl.replace(/\/$/, '');
    this.vaultToken = vaultToken;
    this.mountPath = mountPath.replace(/^\/|\/$/g, '');
  }

  async getKey(kid: string): Promise<Buffer> {
    if (this.cache.has(kid)) {
      return this.cache.get(kid)!;
    }

    const urlStr = `${this.vaultUrl}/v1/${this.mountPath}/data/${kid}`;
    const options = {
      headers: {
        'X-Vault-Token': this.vaultToken,
        'Accept': 'application/json'
      },
      timeout: 5000,
      rejectUnauthorized: process.env.PANDA_VAULT_INSECURE !== '1'
    };

    return new Promise((resolve, reject) => {
      const client = urlStr.startsWith('https') ? https : http;
      client.get(urlStr, options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new KeyNotFoundError(`Could not retrieve key '${kid}' from Vault (HTTP status code: ${res.statusCode})`));
            return;
          }

          try {
            const data = JSON.parse(body);
            const keyVal = data.data?.data?.key || data.data?.data?.value;
            if (!keyVal) {
              reject(new KeyNotFoundError(`Key '${kid}' not found in Vault response data structure.`));
              return;
            }

            const keyBuf = Buffer.from(keyVal, 'base64');
            if (keyBuf.length !== 32) {
              reject(new KeyNotFoundError(`Key '${kid}' retrieved from Vault is not a valid 32-byte base64 string.`));
              return;
            }

            this.cache.set(kid, keyBuf);
            resolve(keyBuf);
          } catch (e) {
            reject(new KeyNotFoundError(`Failed to parse Vault response for key '${kid}'.`));
          }
        });
      }).on('error', (err) => {
        reject(new KeyNotFoundError(`Vault request failed: ${err.message}`));
      });
    });
  }
}
