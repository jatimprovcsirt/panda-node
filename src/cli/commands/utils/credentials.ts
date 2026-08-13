import * as crypto from 'crypto';
import { writeCredentials as writeCreds, readCredentials as readCreds } from './panda-dir';

/**
 * Credential storage utilities
 * Handles encrypted storage of tokens and sensitive credentials
 */

const ENCRYPTION_KEY = crypto.scryptSync('panda-credentials', 'panda-salt', 32);
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt data using AES-256-GCM
 */
function encrypt(data: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Combine: iv + authTag + encrypted
  return iv.toString('hex') + authTag.toString('hex') + encrypted;
}

/**
 * Decrypt data using AES-256-GCM
 */
function decrypt(encryptedData: string): string {
  const ivHex = encryptedData.slice(0, IV_LENGTH * 2);
  const authTagHex = encryptedData.slice(IV_LENGTH * 2, (IV_LENGTH + AUTH_TAG_LENGTH) * 2);
  const encryptedHex = encryptedData.slice((IV_LENGTH + AUTH_TAG_LENGTH) * 2);

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, undefined, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Panda credentials configuration
 */
export interface PandaCredentials {
  token?: string;
  provider: 'local' | 'vault' | 'infisical';
  defaultKid?: string;
  keys?: Record<string, {
    created: string;
    provider: string;
  }>;
  // Vault options
  vaultUrl?: string;
  vaultToken?: string;
  vaultMount?: string;
  // Infisical options
  infisicalSiteUrl?: string;
  infisicalClientId?: string;
  infisicalClientSecret?: string;
  infisicalProjectId?: string;
  infisicalEnvironment?: string;
  infisicalCacheTTL?: string;
}

/**
 * Write credentials to file (JSON format)
 */
export function writeCredentials(credentials: PandaCredentials): void {
  const data = JSON.stringify(credentials, null, 2);
  writeCreds(data);
}

/**
 * Read credentials from file
 */
export function readCredentials(): PandaCredentials | null {
  const raw = readCreds();

  if (!raw || raw === '') {
    return null;
  }

  try {
    // Try to parse as JSON (unencrypted)
    return JSON.parse(raw);
  } catch {
    // Try to decrypt (legacy encrypted format)
    try {
      const decrypted = decrypt(raw);
      return JSON.parse(decrypted);
    } catch (error) {
      throw new Error('Failed to read credentials. File may be corrupted.');
    }
  }
}

/**
 * Store encrypted credentials (legacy)
 */
export interface StoredCredentials {
  token: string;
  provider?: {
    type: string;
    [key: string]: any;
  };
}

export function storeCredentials(credentials: StoredCredentials): void {
  const data = JSON.stringify(credentials);
  const encrypted = encrypt(data);
  writeCreds(encrypted);
}

/**
 * Retrieve and decrypt credentials (legacy)
 */
export function retrieveCredentials(): StoredCredentials | null {
  const raw = readCreds();

  if (!raw || raw === '') {
    return null;
  }

  try {
    const decrypted = decrypt(raw);
    return JSON.parse(decrypted);
  } catch (error) {
    throw new Error('Failed to decrypt credentials. File may be corrupted.');
  }
}
