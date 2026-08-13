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

/**
 * Configuration for InfisicalKeyProvider
 */
export interface InfisicalConfig {
  /** Infisical site URL (e.g., https://app.infisical.com) */
  siteUrl: string;
  /** Machine Identity Client ID */
  clientId: string;
  /** Machine Identity Client Secret */
  clientSecret: string;
  /** Infisical Project ID */
  projectId: string;
  /** Environment name (dev, prod, etc.) */
  environment: string;
  /** Cache TTL in seconds (default: 300) */
  cacheTTL?: number;
}

/**
 * Cached key entry with expiration time
 */
interface CachedKey {
  key: Buffer;
  expires: number;
}

/**
 * InfisicalKeyProvider fetches encryption keys from Infisical
 *
 * This provider uses Universal Auth (Machine Identity credentials) to authenticate
 * with Infisical and retrieve encryption keys. Keys are cached in memory with a
 * configurable TTL to reduce API calls.
 */
export class InfisicalKeyProvider implements KeyProvider {
  private cache: Map<string, CachedKey> = new Map();
  private config: InfisicalConfig;
  private siteUrl: string;
  private authenticated: boolean = false;
  private accessToken: string | null = null;
  private tokenExpires: number = 0;

  constructor(config: InfisicalConfig) {
    this.config = {
      ...config,
      cacheTTL: config.cacheTTL ?? 300
    };
    this.siteUrl = this.config.siteUrl.replace(/\/$/, '');
  }

  /**
   * Ensures we have a valid access token for Infisical API
   */
  private async ensureAuthenticated(): Promise<void> {
    // Check if we have a valid cached token
    if (this.authenticated && this.accessToken && Date.now() < this.tokenExpires) {
      return;
    }

    // Authenticate using Universal Auth
    const authUrl = `${this.siteUrl}/api/v1/auth/universal-auth/login`;
    const payload = {
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret
    };

    return new Promise((resolve, reject) => {
      const client = authUrl.startsWith('https') ? https : http;

      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      };

      const req = client.request(authUrl, options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new KeyNotFoundError(`Infisical authentication failed (HTTP ${res.statusCode})`));
            return;
          }

          try {
            const data = JSON.parse(body);
            this.accessToken = data.accessToken;
            // Token expires in 9.5 minutes (Infisical tokens are 10min)
            this.tokenExpires = Date.now() + (9.5 * 60 * 1000);
            this.authenticated = true;
            resolve();
          } catch (e) {
            reject(new KeyNotFoundError(`Failed to parse Infisical auth response`));
          }
        });
      });

      req.on('error', (err) => {
        reject(new KeyNotFoundError(`Infisical auth request failed: ${err.message}`));
      });

      req.write(JSON.stringify(payload));
      req.end();
    });
  }

  async getKey(kid: string): Promise<Buffer> {
    // Check cache first
    const cached = this.cache.get(kid);
    if (cached && cached.expires > Date.now()) {
      return cached.key;
    }

    // Ensure we have a valid access token
    await this.ensureAuthenticated();

    // Fetch secret from Infisical
    const apiUrl = `${this.siteUrl}/api/v3/secrets/raw`;
    const queryParams = new URLSearchParams({
      projectId: this.config.projectId,
      environment: this.config.environment,
      secretPath: kid
    });
    const url = `${apiUrl}?${queryParams}`;

    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;

      const options = {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        },
        timeout: 5000
      };

      const req = client.request(url, options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new KeyNotFoundError(`Could not retrieve key '${kid}' from Infisical (HTTP ${res.statusCode})`));
            return;
          }

          try {
            const data = JSON.parse(body);
            const secretValue = data.secretValue || data.secret;

            if (!secretValue) {
              reject(new KeyNotFoundError(`Key '${kid}' not found in Infisical response`));
              return;
            }

            const keyBuf = Buffer.from(secretValue, 'base64');
            if (keyBuf.length !== 32) {
              reject(new KeyNotFoundError(`Key '${kid}' is not a valid 32-byte base64 string`));
              return;
            }

            // Cache the key
            this.cache.set(kid, {
              key: keyBuf,
              expires: Date.now() + (this.config.cacheTTL! * 1000)
            });

            resolve(keyBuf);
          } catch (e) {
            reject(new KeyNotFoundError(`Failed to parse Infisical response for key '${kid}'`));
          }
        });
      });

      req.on('error', (err) => {
        reject(new KeyNotFoundError(`Infisical request failed: ${err.message}`));
      });

      req.setTimeout(5000, () => {
        req.destroy();
        reject(new KeyNotFoundError(`Infisical request timeout`));
      });

      req.end();
    });
  }
}

/**
 * Factory function to create KeyProvider instances based on driver type
 *
 * @param driver - Type of key provider ('local', 'vault', or 'infisical')
 * @param config - Configuration object for the selected provider
 * @returns Configured KeyProvider instance
 */
export function createKeyProvider(
  driver: 'local' | 'vault' | 'infisical',
  config?: Record<string, any>
): KeyProvider {
  switch (driver) {
    case 'local':
      return new LocalKeyProvider(config?.initialKeys);

    case 'vault':
      if (!config?.vaultUrl || !config?.vaultToken) {
        throw new Error('VaultKeyProvider requires vaultUrl and vaultToken');
      }
      return new VaultKeyProvider(
        config.vaultUrl,
        config.vaultToken,
        config.mountPath ?? 'secret'
      );

    case 'infisical':
      if (!config?.siteUrl || !config?.clientId || !config?.clientSecret ||
          !config?.projectId || !config?.environment) {
        throw new Error('InfisicalKeyProvider requires siteUrl, clientId, clientSecret, projectId, and environment');
      }
      return new InfisicalKeyProvider({
        siteUrl: config.siteUrl,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        projectId: config.projectId,
        environment: config.environment,
        cacheTTL: config.cacheTTL
      });

    default:
      return new LocalKeyProvider();
  }
}
