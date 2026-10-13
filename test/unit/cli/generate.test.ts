/**
 * Unit tests for CLI generate command.
 *
 * Tests cover key generation functionality including different
 * providers and key validation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

describe('CLI Generate Command', () => {
  const testDir = path.join(process.cwd(), 'test-cli-generate');
  const pandaExe = path.join(process.cwd(), 'dist', 'cli', 'index.js');

  beforeEach(() => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Initialize PANDA with local provider
    const pandaDir = path.join(testDir, '.panda');
    fs.mkdirSync(pandaDir, { recursive: true });

    const credentials = {
      token: 'panda_demo_' + 'a'.repeat(48),
      provider: 'local',
      defaultKid: 'default-key'
    };

    fs.writeFileSync(
      path.join(pandaDir, 'credentials'),
      JSON.stringify(credentials)
    );

    fs.writeFileSync(path.join(testDir, '.env'), '');
  });

  afterEach(() => {
    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  const runGenerate = (args: string[]): Promise<{ exitCode: number; output: string }> => {
    return new Promise((resolve) => {
      let output = '';
      // Add --yes flag for non-interactive mode if not already present
      const yesArgs = args.includes('--yes') ? args : [...args, '--yes'];
      const proc = spawn('node', [pandaExe, 'generate', ...yesArgs], {
        cwd: testDir,
        env: { ...process.env }
      });

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        resolve({ exitCode: code || 0, output });
      });
    });
  };

  describe('Key ID Input', () => {
    it('should accept key ID as argument', async () => {
      const result = await runGenerate(['test-key']);

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('test-key');
    });

    it('should error when key ID not provided in non-interactive mode', async () => {
      const result = await runGenerate([]);

      expect(result.exitCode).toBe(1);
      expect(result.output).toMatch(/required.*non-interactive/i);
    });

    it('should reject empty key ID', async () => {
      const result = await runGenerate(['']);

      expect(result.exitCode).toBe(1);
      expect(result.output).toMatch(/required|empty/i);
    });

    it('should validate key ID format', async () => {
      const result = await runGenerate(['invalid key!']);

      expect(result.exitCode).toBe(1);
      expect(result.output).toMatch(/alphanumeric|characters/i);
    });
  });

  describe('Local Provider Key Generation', () => {
    it('should generate 32-byte key', async () => {
      const result = await runGenerate(['local-key']);

      expect(result.exitCode).toBe(0);

      // Check .env file contains the key
      const envContent = fs.readFileSync(path.join(testDir, '.env'), 'utf-8');
      expect(envContent).toContain('PANDA_KEY_LOCAL_KEY=');

      // Verify key is base64 (44 chars for 32 bytes)
      const match = envContent.match(/PANDA_KEY_LOCAL_KEY=([A-Za-z0-9+/=]+)/);
      expect(match).toBeTruthy();
      if (match) {
        const key = Buffer.from(match[1], 'base64');
        expect(key.length).toBe(32);
      }
    });

    it('should write to .env file', async () => {
      await runGenerate(['env-key']);

      const envFile = path.join(testDir, '.env');
      expect(fs.existsSync(envFile)).toBe(true);

      const content = fs.readFileSync(envFile, 'utf-8');
      expect(content).toContain('PANDA_KEY_ENV_KEY=');
    });

    it('should update .env.example file', async () => {
      await runGenerate(['example-key']);

      const envExample = path.join(testDir, '.env.example');
      const content = fs.readFileSync(envExample, 'utf-8');
      expect(content).toContain('PANDA_KEY_EXAMPLE_KEY=');
      // .env.example should have empty value
      expect(content).toMatch(/PANDA_KEY_EXAMPLE_KEY=\r?\n/);
    });

    it('should normalize key ID for env var', async () => {
      await runGenerate(['api-key']);

      const envContent = fs.readFileSync(path.join(testDir, '.env'), 'utf-8');
      expect(envContent).toContain('PANDA_KEY_API_KEY=');
    });

    it('should preserve existing .env entries', async () => {
      // Add existing entry
      const envFile = path.join(testDir, '.env');
      fs.writeFileSync(envFile, 'EXISTING_VAR=value\n');

      await runGenerate(['new-key']);

      const content = fs.readFileSync(envFile, 'utf-8');
      expect(content).toContain('EXISTING_VAR=value');
      expect(content).toContain('PANDA_KEY_NEW_KEY=');
    });
  });

  describe('Vault Provider Key Generation', () => {
    beforeEach(() => {
      // Initialize with Vault provider
      const pandaDir = path.join(testDir, '.panda');
      const credentials = {
        token: 'panda_demo_' + 'a'.repeat(48),
        provider: 'vault',
        vaultUrl: 'http://localhost:8200',
        vaultToken: 'test-token',
        vaultMount: 'secret'
      };

      fs.writeFileSync(
        path.join(pandaDir, 'credentials'),
        JSON.stringify(credentials)
      );
    });

    it('should print vault kv put command', async () => {
      const result = await runGenerate(['vault-key']);

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('vault kv put');
      expect(result.output).toContain('vault-key');
    });

    it('should include base64 key in command', async () => {
      const result = await runGenerate(['vault-test']);

      expect(result.exitCode).toBe(0);
      // Should contain a base64 string (approximately 44 chars)
      expect(result.output).toMatch(/[A-Za-z0-9+/=]{40,}/);
    });

    it('should show manual storage instructions', async () => {
      const result = await runGenerate(['manual-key']);

      expect(result.exitCode).toBe(0);
      expect(result.output).toMatch(/Manual setup|Vault CLI|UI to store/i);
    });
  });

  describe('Infisical Provider Key Generation', () => {
    beforeEach(() => {
      // Initialize with Infisical provider
      const pandaDir = path.join(testDir, '.panda');
      const credentials = {
        token: 'panda_demo_' + 'a'.repeat(48),
        provider: 'infisical',
        infisicalSiteUrl: 'https://app.infisical.com',
        infisicalClientId: 'test-client',
        infisicalClientSecret: 'test-secret',
        infisicalProjectId: 'test-project',
        infisicalEnvironment: 'dev'
      };

      fs.writeFileSync(
        path.join(pandaDir, 'credentials'),
        JSON.stringify(credentials)
      );
    });

    it('should attempt to store in Infisical', async () => {
      const result = await runGenerate(['infisical-key']);

      expect(result.exitCode).toBe(0);
      // Should show storage attempt message
      expect(result.output).toMatch(/Infisical|storing/i);
    });

    it('should show manual instructions on failure', async () => {
      const result = await runGenerate(['fail-key']);

      expect(result.exitCode).toBe(0);
      // Should show manual creation instructions since no Infisical server is running
      expect(result.output).toMatch(/manually|create.*manually/i);
    });

    it('should include secret path in manual instructions', async () => {
      const result = await runGenerate(['path-test']);

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('path-test');
    });
  });

  describe('Key Metadata', () => {
    // Read from keys.json, which is where key metadata lives. These used to
    // read credentials.keys — a second copy of the same information, written
    // by generate and read by nobody else, while keys.json existed with its
    // own API and no writer at all.
    const readKeys = () =>
      JSON.parse(
        fs.readFileSync(path.join(testDir, '.panda', 'keys.json'), 'utf-8')
      ).keys as Array<{ kid: string; created: string; provider: string; location: string }>;

    it('should record key metadata', async () => {
      await runGenerate(['tracked-key']);

      const entry = readKeys().find((k) => k.kid === 'tracked-key');
      expect(entry).toBeDefined();
      expect(entry!.created).toBeDefined();
    });

    it('should store provider in metadata', async () => {
      await runGenerate(['provider-key']);

      expect(readKeys().find((k) => k.kid === 'provider-key')!.provider).toBe('local');
    });

    it('should track multiple keys', async () => {
      await runGenerate(['first-key']);
      await runGenerate(['second-key']);

      const kids = readKeys().map((k) => k.kid);
      expect(kids).toContain('first-key');
      expect(kids).toContain('second-key');
    });
  });

  describe('Error Handling', () => {
    it('should fail without initialization', async () => {
      // Remove .panda directory
      fs.rmSync(path.join(testDir, '.panda'), { recursive: true });

      const result = await runGenerate(['test-key']);

      expect(result.exitCode).toBe(1);
      expect(result.output).toMatch(/not initialized|run.*init/i);
    });

    it('should handle special characters in key ID', async () => {
      const result = await runGenerate(['key@special!']);

      expect(result.exitCode).toBe(1);
      expect(result.output).toMatch(/alphanumeric|characters/i);
    });

    it('should handle spaces in key ID', async () => {
      const result = await runGenerate(['key with spaces']);

      expect(result.exitCode).toBe(1);
    });
  });

  describe('Success Output', () => {
    it('should show generated key name', async () => {
      const result = await runGenerate(['success-key']);

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('success-key');
    });

    it('should show success message', async () => {
      const result = await runGenerate(['done-key']);

      expect(result.exitCode).toBe(0);
      expect(result.output).toMatch(/generated|success|✓/i);
    });

    it('should show usage example', async () => {
      const result = await runGenerate(['usage-key']);

      expect(result.exitCode).toBe(0);
      expect(result.output).toMatch(/encrypt|usage|cipher/i);
    });
  });
});