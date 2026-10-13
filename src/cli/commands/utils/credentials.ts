import * as crypto from 'crypto';
import {
  writeCredentials as writeCreds,
  readCredentials as readCreds,
  readConfig,
  writeConfig,
  PandaConfig,
} from './panda-dir';

/**
 * Credential storage utilities
 *
 * Two files, split by one question: if this leaked, would it cost anything?
 *
 *   .panda/credentials   mode 0600   the four fields that would
 *   .panda/config.json   mode 0644   the thirteen that would not
 *
 * `PandaCredentials` below is the merged view of both, so that callers keep
 * working; the split happens here rather than at every call site. It used to
 * be one file at 0600 holding all seventeen, which meant a Vault URL and a
 * mount path were treated as secrets — unshareable, uncommittable, and
 * indistinguishable from the token sitting beside them at rotation time.
 */

/**
 * The legacy encryption key. This does not protect anything.
 *
 * It is derived from two constants compiled into this file, so it is the
 * same on every installation and recoverable by anyone who can read the
 * source. Anything written under it is effectively in the clear — the file
 * mode was always the real protection, and the only reason this exists is
 * to read files written before the format changed.
 *
 * It is kept, rather than deleted, so those files can still be read. Do not
 * use it for anything written from now on.
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
  // `keys` used to live here as well as in keys.json. It is gone: two
  // records of the same thing, neither kept in step with the other, and
  // keys.json was the one with an API and no writer.
  //
  // Vault options
  vaultUrl?: string;
  vaultToken?: string;
  vaultRoleId?: string;
  vaultSecretId?: string;
  vaultAuthMethod?: 'approle' | 'token';
  vaultMount?: string;
  vaultTokenTTL?: number;  // Token TTL in seconds (default: 3600)
  // Infisical options
  infisicalSiteUrl?: string;
  infisicalClientId?: string;
  infisicalClientSecret?: string;
  infisicalProjectId?: string;
  infisicalEnvironment?: string;
  infisicalCacheTTL?: number;
}

/**
 * The four fields that belong in the locked file.
 *
 * Everything else on `PandaCredentials` is configuration and goes to
 * config.json. This list is the whole of the split.
 */
const SECRET_FIELDS = [
  'token',
  'vaultToken',
  'vaultSecretId',
  'infisicalClientSecret',
] as const;

/** Field names that belong in config.json rather than beside the secrets. */
const CONFIG_FIELDS = [
  'provider',
  'defaultKid',
  'vaultUrl',
  'vaultRoleId',
  'vaultAuthMethod',
  'vaultMount',
  'vaultTokenTTL',
  'infisicalSiteUrl',
  'infisicalClientId',
  'infisicalProjectId',
  'infisicalEnvironment',
  'infisicalCacheTTL',
] as const;

/**
 * Write credentials, split across the two files by sensitivity.
 */
export function writeCredentials(credentials: PandaCredentials): void {
  const flat = credentials as unknown as Record<string, unknown>;

  const secrets: Record<string, unknown> = {};
  for (const field of SECRET_FIELDS) {
    const value = flat[field];
    if (value !== undefined) secrets[field] = value;
  }

  // `keys` is deliberately not written anywhere: keys.json already holds key
  // metadata, with more of it. It was recorded in both places, which is how
  // the two eventually disagree.

  const providerConfig: Record<string, unknown> = {};
  for (const field of CONFIG_FIELDS) {
    if (field === 'provider' || field === 'defaultKid') continue;
    const value = flat[field];
    if (value !== undefined) providerConfig[field] = value;
  }

  const existing = readConfig();
  const config: PandaConfig = {
    version: existing?.version ?? cliVersion(),
    initialized: existing?.initialized ?? new Date().toISOString(),
    provider: {
      type: credentials.provider ?? 'local',
      config: providerConfig,
    },
    defaultKid: credentials.defaultKid,
  };

  writeCreds(JSON.stringify(secrets, null, 2));
  writeConfig(config);
}

/**
 * Read both files and present them as one credential state.
 *
 * A single-file installation — everything in `credentials`, written before
 * the split — is presented the same way and rewritten across two files the
 * next time anything is saved. Without that, every project initialised
 * before this change would look uninitialised after it.
 */
export function readCredentials(): PandaCredentials | null {
  const raw = readCreds();
  const config = readConfig();

  if ((!raw || raw === '') && !config) {
    return null;
  }

  let stored: Record<string, unknown> = {};
  if (raw && raw !== '') {
    stored = parseStored(raw);
  }

  const merged: Record<string, unknown> = { ...stored };

  if (config) {
    // The split layout.
    if (config.provider?.type) merged.provider = config.provider.type;
    if (config.defaultKid !== undefined) merged.defaultKid = config.defaultKid;
    Object.assign(merged, config.provider?.config ?? {});
  } else {
    // Single-file layout: everything is already in `stored`, and `provider`
    // is a plain string there rather than an object.
    if (stored.provider && typeof stored.provider === 'object') {
      const legacy = stored.provider as { type?: string };
      merged.provider = legacy.type ?? 'local';
    }
  }

  if (!merged.provider) merged.provider = 'local';

  return merged as unknown as PandaCredentials;
}

/**
 * Parse the credentials file, accepting both layouts.
 */
function parseStored(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    // The legacy encrypted format. Note that its key is compiled in, so this
    // is a compatibility path and not a confidentiality one — see the
    // comment on ENCRYPTION_KEY.
    try {
      return JSON.parse(decrypt(raw));
    } catch {
      throw new Error('Failed to read credentials. File may be corrupted.');
    }
  }
}

/**
 * The version recorded in config.json — which CLI wrote this project's
 * configuration, so a future change can tell what it is migrating from.
 *
 * Read from the package rather than repeated here, because a version written
 * out by hand is a version that ends up wrong: the Python SDK reported 0.1.0
 * from a literal in its CLI for two releases after the package had moved on.
 */
function cliVersion(): string {
  try {
    // Four levels up from dist/cli/commands/utils to the package root.
    return require('../../../../package.json').version ?? '0.0.0';
  } catch {
    return '0.0.0';
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
