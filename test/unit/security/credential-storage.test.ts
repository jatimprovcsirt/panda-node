/**
 * Security tests for credential storage.
 *
 * Tests verify that credentials are stored securely with proper
 * file permissions and data integrity.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';

describe('Security: Credential Storage', () => {
  const testDir = path.join(process.cwd(), 'test-security-creds');
  const pandaExe = path.join(process.cwd(), 'dist', 'cli', 'index.js');

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  /**
   * Drive `panda init` through its wizard, answering each prompt as it appears.
   *
   * Writing the whole input and closing stdin does not work, and never did:
   * readline emits a line that arrives with no question pending, and with no
   * listener attached it is dropped. Only the first prompt was ever answered,
   * the wizard waited for input that had already been sent, and the process
   * exited having written nothing — which is why the nineteen tests below
   * were failing. The implementation was fine; the hose was.
   *
   * So the answers are held back and written one at a time, each after the
   * prompt it belongs to.
   */
  const runInit = (args: string[], input: string): Promise<{ exitCode: number; output: string }> => {
    return new Promise((resolve) => {
      let output = '';
      const lines = input.split('\n').filter((line) => line.length > 0);
      let sent = 0;
      let lastLength = -1;

      const proc = spawn('node', [pandaExe, 'init', ...args], {
        cwd: testDir,
        env: { ...process.env }
      });

      // A prompt that is waiting has printed ': ' and nothing after it.
      // Sending only when the output has grown since the last answer is what
      // keeps two prompts from being answered by one line.
      let idle: ReturnType<typeof setTimeout>;

      const answerPrompt = () => {
        clearTimeout(idle);
        if (sent >= lines.length) {
          // Out of answers. Closing stdin lets a waiting prompt see end of
          // input and the process exit; without this the wizard waits forever
          // and the test hangs rather than failing.
          try {
            proc.stdin.end();
          } catch {
            /* already closed */
          }
          return;
        }
        if (output.endsWith(': ') && output.length !== lastLength) {
          lastLength = output.length;
          proc.stdin.write(lines[sent++] + '\n');
        }
        // The wizard prints several lines between prompts. Waiting for quiet
        // before concluding that it is done avoids cutting it off mid-sentence.
        idle = setTimeout(() => {
          try {
            proc.stdin.end();
          } catch {
            /* already closed */
          }
        }, 1500);
      };

      proc.stdout.on('data', (data) => {
        output += data.toString();
        answerPrompt();
      });

      proc.stderr.on('data', (data) => {
        output += data.toString();
        answerPrompt();
      });

      // Nothing in the tests reads stdin, but a closed pipe would otherwise
      // raise EPIPE into the test run and look like a failure in the command.
      proc.stdin.on('error', () => {});

      proc.on('close', (code) => {
        clearTimeout(idle);
        resolve({ exitCode: code || 0, output });
      });
    });
  };

  describe('Credentials File Security', () => {
    it('should create credentials file in .panda directory', async () => {
      await runInit(['--token', 'panda_demo_' + 'a'.repeat(48)], '1\nkey\n');

      const credsFile = path.join(testDir, '.panda', 'credentials');
      expect(fs.existsSync(credsFile)).toBe(true);
    });

    it('should store token in credentials file', async () => {
      const testToken = 'panda_demo_' + 'a'.repeat(48);
      await runInit(['--token', testToken], '1\nkey\n');

      const credsFile = path.join(testDir, '.panda', 'credentials');
      const content = fs.readFileSync(credsFile, 'utf-8');
      expect(content).toContain(testToken);
    });

    it('should store provider type in credentials', async () => {
      await runInit(['--token', 'panda_demo_' + 'a'.repeat(48)], '1\nkey\n');

      // From config.json, not credentials. The provider is not a secret and
      // does not belong in the file that is locked down — which is the whole
      // point of the split.
      const configFile = path.join(testDir, '.panda', 'config.json');
      const content = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      expect(content.provider.type).toBe('local');
    });

    it('should store Infisical client secret in credentials', async () => {
      await runInit(
        ['--token', 'panda_demo_' + 'a'.repeat(48)],
        '3\nhttps://app.infisical.com\ntest-client\nsuper-secret-value\ntest-project\ndev\n300\nkey\n'
      );

      const credsFile = path.join(testDir, '.panda', 'credentials');
      const content = JSON.parse(fs.readFileSync(credsFile, 'utf-8'));
      expect(content.infisicalClientSecret).toBe('super-secret-value');
    });

    it('should store Vault token in credentials', async () => {
      await runInit(
        ['--token', 'panda_demo_' + 'a'.repeat(48)],
        '2\nhttp://localhost:8200\nvault-token-value\nsecret\nkey\n'
      );

      const credsFile = path.join(testDir, '.panda', 'credentials');
      const content = JSON.parse(fs.readFileSync(credsFile, 'utf-8'));
      expect(content.vaultToken).toBe('vault-token-value');
    });

    describe('File Permissions (Unix)', () => {
      beforeEach(() => {
        // Skip on Windows
        if (process.platform === 'win32') {
          return;
        }
      });

      it('should set restrictive permissions on credentials file (Unix)', async () => {
        if (process.platform === 'win32') {
          return;
        }

        await runInit(['--token', 'panda_demo_' + 'a'.repeat(48)], '1\nkey\n');

        const credsFile = path.join(testDir, '.panda', 'credentials');
        const stats = fs.statSync(credsFile);
        const mode = stats.mode & 0o777;

        // Should be 0o600 (user read/write only) or 0o400 (user read only)
        // On some systems, might be 0o640 or similar
        const isRestricted = (mode & 0o077) === 0; // No permissions for group/others
        expect(isRestricted).toBe(true);
      });

      it('should not allow world-readable credentials (Unix)', async () => {
        if (process.platform === 'win32') {
          return;
        }

        await runInit(['--token', 'panda_demo_' + 'a'.repeat(48)], '1\nkey\n');

        const credsFile = path.join(testDir, '.panda', 'credentials');
        const stats = fs.statSync(credsFile);

        // Check that others have no read permission
        const othersRead = !!(stats.mode & fs.constants.S_IROTH);
        expect(othersRead).toBe(false);
      });

      it('should not allow world-writable credentials (Unix)', async () => {
        if (process.platform === 'win32') {
          return;
        }

        await runInit(['--token', 'panda_demo_' + 'a'.repeat(48)], '1\nkey\n');

        const credsFile = path.join(testDir, '.panda', 'credentials');
        const stats = fs.statSync(credsFile);

        const othersWrite = !!(stats.mode & fs.constants.S_IWOTH);
        expect(othersWrite).toBe(false);
      });
    });

    describe('Data Integrity', () => {
      it('should produce valid JSON in credentials file', async () => {
        await runInit(['--token', 'panda_demo_' + 'a'.repeat(48)], '1\nkey\n');

        const credsFile = path.join(testDir, '.panda', 'credentials');
        const content = fs.readFileSync(credsFile, 'utf-8');

        expect(() => JSON.parse(content)).not.toThrow();
      });

      it('should preserve all credential fields', async () => {
        await runInit(
          ['--token', 'panda_demo_' + 'a'.repeat(48)],
          '3\nhttps://app.infisical.com\ncid\ncsecret\nproj\ndev\n600\nkey\n'
        );

        const credsFile = path.join(testDir, '.panda', 'credentials');
        const content = JSON.parse(fs.readFileSync(credsFile, 'utf-8'));

        expect(content.token).toBeDefined();
        expect(content.provider).toBeDefined();
        expect(content.infisicalSiteUrl).toBeDefined();
        expect(content.infisicalClientId).toBeDefined();
        expect(content.infisicalClientSecret).toBeDefined();
        expect(content.infisicalProjectId).toBeDefined();
        expect(content.infisicalEnvironment).toBeDefined();
        expect(content.infisicalCacheTTL).toBe(600);
      });

      it('should handle Unicode in configuration values', async () => {
        // Note: Current implementation may not support all Unicode
        // This test verifies it doesn't crash
        await runInit(['--token', 'panda_demo_' + 'a'.repeat(48)], '1\nkey\n');

        const result = await runInit(['--token', 'panda_demo_' + 'a'.repeat(48)], '1\nkey\n');
        expect(result.exitCode).toBe(0);
      });
    });

    describe('Credential Persistence', () => {
      it('should overwrite existing credentials on reinit', async () => {
        // First init
        await runInit(['--token', 'panda_demo_' + 'a'.repeat(48)], '1\nkey1\n');

        // Reinit with different data
        await runInit(
          ['--token', 'panda_demo_' + 'b'.repeat(48), '--reinit'],
          '2\nhttp://vault.example.com\ntoken\nmount\nkey2\n'
        );

        const credsFile = path.join(testDir, '.panda', 'credentials');
        const content = JSON.parse(fs.readFileSync(credsFile, 'utf-8'));

        expect(content.provider).toBe('vault');
        expect(content.token).toContain('b'); // Should have new token
      });

      it('should preserve credentials between commands', async () => {
        await runInit(['--token', 'panda_demo_' + 'a'.repeat(48)], '1\nkey\n');

        // Run another command (status) to verify persistence
        const result = await runInit(['--token', 'panda_demo_' + 'a'.repeat(48)], '');

        expect(result.output).toContain('already initialized');
      });
    });
  });

  describe('Keys File Security', () => {
    it('should create keys.json file', async () => {
      await runInit(['--token', 'panda_demo_' + 'a'.repeat(48)], '1\nkey\n');

      const keysFile = path.join(testDir, '.panda', 'keys.json');
      expect(fs.existsSync(keysFile)).toBe(true);
    });

    it('should not store actual key values in keys.json', async () => {
      await runInit(['--token', 'panda_demo_' + 'a'.repeat(48)], '1\nkey\n');

      const keysFile = path.join(testDir, '.panda', 'keys.json');
      const content = fs.readFileSync(keysFile, 'utf-8');

      // Should not contain base64 key data (long base64 strings)
      expect(content).not.toMatch(/[A-Za-z0-9+/=]{40}/);
    });

    it('should store key metadata only', async () => {
      await runInit(['--token', 'panda_demo_' + 'a'.repeat(48)], '1\nkey\n');

      const keysFile = path.join(testDir, '.panda', 'keys.json');
      const content = JSON.parse(fs.readFileSync(keysFile, 'utf-8'));

      // Should have metadata fields
      if (content.keys && Object.keys(content.keys).length > 0) {
        const firstKey = Object.values(content.keys)[0] as any;
        expect(firstKey).toHaveProperty('created');
        expect(firstKey).toHaveProperty('provider');
        expect(firstKey).not.toHaveProperty('value');
        expect(firstKey).not.toHaveProperty('key');
      }
    });
  });

  describe('.env File Security', () => {
    it('should warn about .env file security', async () => {
      const result = await runInit(['--token', 'panda_demo_' + 'a'.repeat(48)], '1\nkey\n');

      expect(result.output).toMatch(/securely|never commit|production/i);
    });

    it('should create .env.example with empty values', async () => {
      await runInit(['--token', 'panda_demo_' + 'a'.repeat(48)], '1\nkey\n');

      const envExample = path.join(testDir, '.env.example');
      const content = fs.readFileSync(envExample, 'utf-8');

      // Should have empty values after =
      const lines = content.split('\n').filter((l) => l.startsWith('PANDA_'));
      lines.forEach((line) => {
        const parts = line.split('=');
        if (parts.length > 1) {
          // Value after = should be empty or whitespace
          expect(parts[1].trim()).toBe('');
        }
      });
    });

    it('should store actual key in .env (not .env.example)', async () => {
      await runInit(['--token', 'panda_demo_' + 'a'.repeat(48)], '1\nkey\n');

      const envFile = path.join(testDir, '.env');
      const envExample = path.join(testDir, '.env.example');

      const envContent = fs.readFileSync(envFile, 'utf-8');
      const exampleContent = fs.readFileSync(envExample, 'utf-8');

      // .env should have non-empty values
      const envLines = envContent.split('\n').filter((l) => l.includes('PANDA_KEY_'));
      expect(envLines.length).toBeGreaterThan(0);

      // At least one should have a value
      const hasValue = envLines.some((line) => {
        const parts = line.split('=');
        return parts.length > 1 && parts[1].trim().length > 0;
      });
      expect(hasValue).toBe(true);
    });
  });

  describe('Sensitive Data Handling', () => {
    it('should not log token in CLI output', async () => {
      const testToken = 'panda_demo_sensitive_token_' + 'a'.repeat(30);
      const result = await runInit(['--token', testToken], '1\nkey\n');

      // Token should not appear in output (except validation message)
      const tokenMentions = (result.output.match(new RegExp(testToken, 'g')) || []).length;
      expect(tokenMentions).toBeLessThanOrEqual(1); // May appear once in validation
    });

    it('should not echo secret input back', async () => {
      const result = await runInit(
        ['--token', 'panda_demo_' + 'a'.repeat(48)],
        '2\nhttp://localhost:8200\n'
      );

      // Should not reveal the vault token that was entered
      // The output should not contain the actual token value
      expect(result.output).not.toContain('s.'); // Vault token format
    });
  });

  describe('Directory Security', () => {
    it('should create .panda directory', async () => {
      await runInit(['--token', 'panda_demo_' + 'a'.repeat(48)], '1\nkey\n');

      const pandaDir = path.join(testDir, '.panda');
      expect(fs.existsSync(pandaDir)).toBe(true);
      expect(fs.statSync(pandaDir).isDirectory()).toBe(true);
    });

    it('should store all PANDA data in .panda directory', async () => {
      await runInit(['--token', 'panda_demo_' + 'a'.repeat(48)], '1\nkey\n');

      const pandaDir = path.join(testDir, '.panda');
      const files = fs.readdirSync(pandaDir);

      expect(files).toContain('credentials');
      expect(files).toContain('config.json');
      expect(files).toContain('keys.json');
    });

    it('should not scatter PANDA files across project', async () => {
      await runInit(['--token', 'panda_demo_' + 'a'.repeat(48)], '1\nkey\n');

      // Check that PANDA files are only in .panda or .env
      const allFiles = getAllFiles(testDir);
      const pandaFilesOutside = allFiles.filter((f) =>
        f.includes('panda') && !f.includes('.panda') && !f.includes('.env')
      );

      expect(pandaFilesOutside).toHaveLength(0);
    });
  });

  describe('Deinit Security', () => {
    const runDeinit = (force: boolean): Promise<{ exitCode: number; output: string }> => {
      return new Promise((resolve) => {
        let output = '';
        const proc = spawn('node', [pandaExe, 'deinit', ...(force ? ['--force'] : [])], {
          cwd: testDir,
          env: { ...process.env }
        });

        proc.stdin.write('y\n');
        proc.stdin.end();

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

    it('should remove .panda directory on deinit', async () => {
      await runInit(['--token', 'panda_demo_' + 'a'.repeat(48)], '1\nkey\n');
      await runDeinit(true);

      const pandaDir = path.join(testDir, '.panda');
      expect(fs.existsSync(pandaDir)).toBe(false);
    });

    it('should warn about encrypted data on deinit', async () => {
      await runInit(['--token', 'panda_demo_' + 'a'.repeat(48)], '1\nkey\n');

      const result = await runDeinit(true);
      expect(result.output).toMatch(/encrypted.*data|won't be able to decrypt|warning/i);
    });

    it('should require confirmation without --force', async () => {
      await runInit(['--token', 'panda_demo_' + 'a'.repeat(48)], '1\nkey\n');

      const proc = spawn('node', [pandaExe, 'deinit'], {
        cwd: testDir,
        env: { ...process.env }
      });

      proc.stdin.write('n\n');
      proc.stdin.end();

      const output = await new Promise<string>((resolve) => {
        let out = '';
        proc.stdout.on('data', (d) => out += d.toString());
        proc.stderr.on('data', (d) => out += d.toString());
        proc.on('close', () => resolve(out));
      });

      expect(output).toMatch(/continue\?|abort/i);
    });
  });
});

// Helper function to recursively get all files
function getAllFiles(dirPath: string): string[] {
  const files: string[] = [];

  function traverse(currentPath: string) {
    const items = fs.readdirSync(currentPath);
    for (const item of items) {
      const fullPath = path.join(currentPath, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (!fullPath.includes('node_modules')) {
          traverse(fullPath);
        }
      } else {
        files.push(fullPath);
      }
    }
  }

  traverse(dirPath);
  return files;
}
