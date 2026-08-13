/**
 * Unit tests for CLI status command.
 *
 * Tests cover status display for different states and configurations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

describe('CLI Status Command', () => {
  const testDir = path.join(process.cwd(), 'test-cli-status');
  const pandaExe = path.join(process.cwd(), 'dist', 'cli', 'index.js');

  beforeEach(() => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  const runStatus = (): Promise<{ exitCode: number; output: string }> => {
    return new Promise((resolve) => {
      let output = '';
      const proc = spawn('node', [pandaExe, 'status'], {
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

  const initPanda = (provider: string, config?: any): void => {
    const pandaDir = path.join(testDir, '.panda');
    fs.mkdirSync(pandaDir, { recursive: true });

    const credentials: any = {
      token: 'panda_demo_' + 'a'.repeat(48),
      provider: provider,
      defaultKid: 'default-key'
    };

    if (config) {
      Object.assign(credentials, config);
    }

    fs.writeFileSync(
      path.join(pandaDir, 'credentials'),
      JSON.stringify(credentials)
    );
  };

  describe('Not Initialized State', () => {
    it('should show not initialized message', async () => {
      const result = await runStatus();

      expect(result.exitCode).toBe(0);
      expect(result.output).toMatch(/not initialized|run.*init/i);
    });

    it('should suggest init command', async () => {
      const result = await runStatus();

      expect(result.output).toContain('init');
    });
  });

  describe('Local Provider Status', () => {
    beforeEach(() => {
      initPanda('local');
    });

    it('should show provider type', async () => {
      const result = await runStatus();

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Provider');
      expect(result.output).toContain('local');
    });

    it('should show default key ID', async () => {
      const result = await runStatus();

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('default-key');
    });

    it('should show keys list if keys exist', async () => {
      // Add keys metadata
      const keysFile = path.join(testDir, '.panda', 'keys.json');
      fs.writeFileSync(keysFile, JSON.stringify({
        keys: [
          { kid: 'test-key', created: '2024-01-01T00:00:00Z', provider: 'local' },
          { kid: 'another-key', created: '2024-01-02T00:00:00Z', provider: 'local' }
        ]
      }));

      const result = await runStatus();

      expect(result.output).toContain('test-key');
      expect(result.output).toContain('another-key');
    });
  });

  describe('Vault Provider Status', () => {
    beforeEach(() => {
      initPanda('vault', {
        vaultUrl: 'http://localhost:8200',
        vaultMount: 'secret'
      });
    });

    it('should show Vault URL', async () => {
      const result = await runStatus();

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('localhost:8200');
    });

    it('should show mount path', async () => {
      const result = await runStatus();

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Mount');
      expect(result.output).toContain('secret');
    });

    it('should show provider type as vault', async () => {
      const result = await runStatus();

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('vault');
    });
  });

  describe('Infisical Provider Status', () => {
    beforeEach(() => {
      initPanda('infisical', {
        infisicalSiteUrl: 'https://app.infisical.com',
        infisicalProjectId: 'test-project-123',
        infisicalEnvironment: 'production'
      });
    });

    it('should show Infisical site URL', async () => {
      const result = await runStatus();

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('app.infisical.com');
    });

    it('should show project ID', async () => {
      const result = await runStatus();

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('test-project-123');
    });

    it('should show environment', async () => {
      const result = await runStatus();

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('production');
    });

    it('should show provider type as infisical', async () => {
      const result = await runStatus();

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('infisical');
    });
  });

  describe('Keys Display', () => {
    beforeEach(() => {
      initPanda('local');
    });

    it('should show no keys message when none exist', async () => {
      const result = await runStatus();

      expect(result.exitCode).toBe(0);
      expect(result.output).not.toContain('Keys:');
    });

    it('should show single key', async () => {
      const keysFile = path.join(testDir, '.panda', 'keys.json');
      fs.writeFileSync(keysFile, JSON.stringify({
        keys: [
          { kid: 'nik-key', created: '2024-01-15T10:30:00Z', provider: 'local' }
        ]
      }));

      const result = await runStatus();

      expect(result.output).toContain('nik-key');
    });

    it('should show multiple keys', async () => {
      const keysFile = path.join(testDir, '.panda', 'keys.json');
      fs.writeFileSync(keysFile, JSON.stringify({
        keys: [
          { kid: 'key1', created: '2024-01-01T00:00:00Z', provider: 'local' },
          { kid: 'key2', created: '2024-01-02T00:00:00Z', provider: 'local' },
          { kid: 'key3', created: '2024-01-03T00:00:00Z', provider: 'local' }
        ]
      }));

      const result = await runStatus();

      expect(result.output).toContain('key1');
      expect(result.output).toContain('key2');
      expect(result.output).toContain('key3');
    });

    it('should show key creation date', async () => {
      const keysFile = path.join(testDir, '.panda', 'keys.json');
      fs.writeFileSync(keysFile, JSON.stringify({
        keys: [
          { kid: 'dated-key', created: '2024-06-15T14:30:00Z', provider: 'local' }
        ]
      }));

      const result = await runStatus();

      expect(result.output).toMatch(/created|2024-06-15/i);
    });
  });

  describe('Output Format', () => {
    beforeEach(() => {
      initPanda('infisical', {
        infisicalSiteUrl: 'https://app.infisical.com',
        infisicalProjectId: 'proj-123',
        infisicalEnvironment: 'dev'
      });
    });

    it('should have formatted output with headers', async () => {
      const result = await runStatus();

      expect(result.exitCode).toBe(0);
      expect(result.output).toMatch(/Provider|Site|Project/i);
    });

    it('should use bullet points for keys', async () => {
      const keysFile = path.join(testDir, '.panda', 'keys.json');
      fs.writeFileSync(keysFile, JSON.stringify({
        keys: [
          { kid: 'bullet-key', created: '2024-01-01T00:00:00Z', provider: 'local' }
        ]
      }));

      const result = await runStatus();

      expect(result.output).toContain('•');
    });
  });

  describe('Error Handling', () => {
    it('should handle corrupted credentials file gracefully', async () => {
      const pandaDir = path.join(testDir, '.panda');
      fs.mkdirSync(pandaDir, { recursive: true });
      fs.writeFileSync(path.join(pandaDir, 'credentials'), '{invalid');

      const result = await runStatus();

      expect(result.exitCode).toBe(0);
      expect(result.output).toMatch(/error|corrupted|not initialized/i);
    });

    it('should handle corrupted keys.json gracefully', async () => {
      initPanda('local');

      const keysFile = path.join(testDir, '.panda', 'keys.json');
      fs.writeFileSync(keysFile, '{invalid json');

      const result = await runStatus();

      expect(result.exitCode).toBe(0);
      // Should still show basic status
      expect(result.output).toContain('Provider');
    });
  });
});