import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Panda directory utilities
 * Manages .panda/ directory structure and files
 */

export const PANDA_DIR = '.panda';
export const CONFIG_FILE = 'config.json';
export const CREDENTIALS_FILE = 'credentials';
export const KEYS_FILE = 'keys.json';

/**
 * Check if .panda directory exists
 */
export function pandaDirExists(): boolean {
  const pandaPath = path.join(process.cwd(), PANDA_DIR);
  return fs.existsSync(pandaPath);
}

/**
 * Create .panda directory structure
 */
export function createPandaDirectory(): void {
  const pandaPath = path.join(process.cwd(), PANDA_DIR);

  if (!fs.existsSync(pandaPath)) {
    fs.mkdirSync(pandaPath, { recursive: true });
  }

  // Create empty credentials file with restricted permissions
  const credentialsPath = path.join(pandaPath, CREDENTIALS_FILE);
  if (!fs.existsSync(credentialsPath)) {
    fs.writeFileSync(credentialsPath, '', { mode: 0o600 });
  }

  // Create empty keys.json
  const keysPath = path.join(pandaPath, KEYS_FILE);
  if (!fs.existsSync(keysPath)) {
    fs.writeFileSync(keysPath, JSON.stringify({ keys: [] }, null, 2));
  }
}

/**
 * Read config.json
 */
export interface PandaConfig {
  version: string;
  initialized: string;
  provider: {
    type: 'local' | 'vault' | 'infisical';
    config?: Record<string, any>;
  };
  defaultKid?: string;
}

export function readConfig(): PandaConfig | null {
  const configPath = path.join(process.cwd(), PANDA_DIR, CONFIG_FILE);

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse ${CONFIG_FILE}: ${error}`);
  }
}

/**
 * Write config.json
 *
 * Mode 0644, deliberately, and unlike the credentials file next to it. What
 * goes here is not secret — a Vault URL, a mount path, an environment name —
 * and locking it down has costs: it cannot be shared between developers, put
 * in a ConfigMap, or read by a tool that has no business holding the token.
 */
export function writeConfig(config: PandaConfig): void {
  const pandaPath = path.join(process.cwd(), PANDA_DIR);
  if (!fs.existsSync(pandaPath)) {
    fs.mkdirSync(pandaPath, { recursive: true });
  }

  const configPath = path.join(pandaPath, CONFIG_FILE);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o644 });
}

/**
 * Read encrypted credentials
 */
export function readCredentials(): string | null {
  const credentialsPath = path.join(process.cwd(), PANDA_DIR, CREDENTIALS_FILE);

  if (!fs.existsSync(credentialsPath)) {
    return null;
  }

  return fs.readFileSync(credentialsPath, 'utf8');
}

/**
 * Write encrypted credentials
 */
export function writeCredentials(encryptedData: string): void {
  const pandaPath = path.join(process.cwd(), PANDA_DIR);

  // Create .panda directory if it doesn't exist
  if (!fs.existsSync(pandaPath)) {
    fs.mkdirSync(pandaPath, { recursive: true });
  }

  const credentialsPath = path.join(pandaPath, CREDENTIALS_FILE);
  fs.writeFileSync(credentialsPath, encryptedData, { mode: 0o600 });
}

/**
 * Read keys metadata
 */
export interface KeyMetadata {
  kid: string;
  created: string;
  provider: string;
  location: string;
}

export interface KeysJson {
  keys: KeyMetadata[];
}

export function readKeysMetadata(): KeysJson | null {
  const keysPath = path.join(process.cwd(), PANDA_DIR, KEYS_FILE);

  if (!fs.existsSync(keysPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(keysPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse ${KEYS_FILE}: ${error}`);
  }
}

/**
 * Write keys metadata
 */
export function writeKeysMetadata(keys: KeysJson): void {
  const keysPath = path.join(process.cwd(), PANDA_DIR, KEYS_FILE);
  fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2));
}

/**
 * Add key to metadata
 */
export function addKeyToMetadata(kid: string, provider: string, location: string): void {
  const keys = readKeysMetadata() || { keys: [] };

  // Check if key already exists
  if (keys.keys.some(k => k.kid === kid)) {
    throw new Error(`Key '${kid}' already exists`);
  }

  keys.keys.push({
    kid,
    created: new Date().toISOString(),
    provider,
    location
  });

  writeKeysMetadata(keys);
}

/**
 * Remove .panda directory
 */
export function removePandaDirectory(): void {
  const pandaPath = path.join(process.cwd(), PANDA_DIR);

  if (fs.existsSync(pandaPath)) {
    fs.rmSync(pandaPath, { recursive: true, force: true });
  }
}
