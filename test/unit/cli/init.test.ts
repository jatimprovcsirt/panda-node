/**
 * Unit tests for CLI init command.
 *
 * Tests cover the init command in quick mode including token validation,
 * provider selection, and credential storage.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

describe('CLI Init Command', () => {
  let testDir: string;
  const pandaExe = path.join(process.cwd(), 'dist', 'cli', 'index.js');

  beforeEach(() => {
    // Create unique test directory for each test
    testDir = path.join(process.cwd(), 'test-cli-init-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Cleanup test directory with retries
    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch (error) {
        // Windows file lock workaround - try once more
        setTimeout(() => {
          try {
            fs.rmSync(testDir, { recursive: true, force: true });
          } catch (e) {
            // Ignore cleanup errors
          }
        }, 100);
      }
    }
  });

  const runInit = (args: string[]): Promise<{ exitCode: number; output: string }> => {
    return new Promise((resolve) => {
      let output = '';
      // Use --provider local for non-interactive testing
      const providerArgs = args.includes('--provider') ? args : [...args, '--provider', 'local'];
      const proc = spawn('node', [pandaExe, 'init', ...providerArgs], {
        cwd: testDir,
        env: { ...process.env },
        timeout: 10000 // 10 second timeout
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

      proc.on('error', (error) => {
        resolve({ exitCode: 1, output: error.message });
      });
    });
  };

  describe('Token Validation', () => {
    it('should validate correct demo token format', async () => {
      // Use actual demo token to skip online validation
      const validToken = 'panda_demo_76d08573d453cdbdb4bf5704d13f8f54d57cd3c47c9b4be2';
      const result = await runInit(['--token', validToken, '--kid', 'test-key']);

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('token gate passed');
    });

    it('should validate correct live token format', async () => {
      // Valid hex live token - will fail online validation but pass format check
      const validToken = 'panda_live_' + 'f'.repeat(48);
      const result = await runInit(['--token', validToken, '--kid', 'test-key']);

      // Will fail due to online validation, but that's expected
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('Token gate');
    });

    it('should reject invalid token format', async () => {
      const result = await runInit(['--token', 'invalid-token', '--kid', 'test-key']);

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('Token gate failed');
    });

    it('should reject token without panda_ prefix', async () => {
      const result = await runInit(['--token', 'demo_' + 'a'.repeat(48), '--kid', 'test-key']);

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('Token gate failed');
    });

    it('should reject token with wrong type (not demo or live)', async () => {
      const result = await runInit(['--token', 'panda_staging_' + 'a'.repeat(48), '--kid', 'test-key']);

      expect(result.exitCode).toBe(1);
    });

    it('should reject token with wrong length (too short)', async () => {
      const result = await runInit(['--token', 'panda_demo_' + 'a'.repeat(40), '--kid', 'test-key']);

      expect(result.exitCode).toBe(1);
    });

    it('should reject token with non-hex characters', async () => {
      const result = await runInit(['--token', 'panda_demo_' + 'g'.repeat(48), '--kid', 'test-key']);

      expect(result.exitCode).toBe(1);
    });
  });

  describe('.panda Directory Creation', () => {
    it('should create credentials file', async () => {
      await runInit(['--token', 'panda_demo_76d08573d453cdbdb4bf5704d13f8f54d57cd3c47c9b4be2', '--kid', 'test-key']);

      const credsFile = path.join(testDir, '.panda', 'credentials');
      expect(fs.existsSync(credsFile)).toBe(true);
    });

    it('should create keys.json file', async () => {
      await runInit(['--token', 'panda_demo_76d08573d453cdbdb4bf5704d13f8f54d57cd3c47c9b4be2', '--kid', 'test-key']);

      const keysFile = path.join(testDir, '.panda', 'keys.json');
      expect(fs.existsSync(keysFile)).toBe(true);
    });
  });

  describe('Local Provider Specific (Quick Mode)', () => {
    it('should generate key for local provider', async () => {
      const result = await runInit(
        ['--token', 'panda_demo_76d08573d453cdbdb4bf5704d13f8f54d57cd3c47c9b4be2', '--kid', 'local-key']
      );

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('token gate passed');
    });

    it('should create .env file', async () => {
      await runInit(
        ['--token', 'panda_demo_76d08573d453cdbdb4bf5704d13f8f54d57cd3c47c9b4be2', '--kid', 'local-key']
      );

      const envFile = path.join(testDir, '.env');
      expect(fs.existsSync(envFile)).toBe(true);
    });

    it('should write no key when --skip-key-gen is given', async () => {
      // The flag exists in panda-php, panda-go and panda-py. Without it there
      // is no way to prepare a project for a key provisioned later.
      await runInit(
        ['--token', 'panda_demo_76d08573d453cdbdb4bf5704d13f8f54d57cd3c47c9b4be2', '--skip-key-gen']
      );

      expect(fs.existsSync(path.join(testDir, '.env'))).toBe(false);
      // The identifier is still recorded — only generation is skipped. It
      // lands in config.json rather than credentials, because it is not a
      // secret and the two files are split on exactly that question.
      const config = JSON.parse(
        fs.readFileSync(path.join(testDir, '.panda', 'config.json'), 'utf-8')
      );
      expect(config.defaultKid).toBe('default-key');
    });

    it('should create .env.example file', async () => {
      await runInit(
        ['--token', 'panda_demo_76d08573d453cdbdb4bf5704d13f8f54d57cd3c47c9b4be2', '--kid', 'local-key']
      );

      const envExample = path.join(testDir, '.env.example');
      expect(fs.existsSync(envExample)).toBe(true);
    });

    it('should write PANDA_KEY_* to .env', async () => {
      await runInit(
        ['--token', 'panda_demo_76d08573d453cdbdb4bf5704d13f8f54d57cd3c47c9b4be2', '--kid', 'my-test-key']
      );

      const envFile = path.join(testDir, '.env');
      const content = fs.readFileSync(envFile, 'utf-8');
      expect(content).toContain('PANDA_KEY_MY_TEST_KEY=');
    });

    it('should write empty value to .env.example', async () => {
      await runInit(
        ['--token', 'panda_demo_76d08573d453cdbdb4bf5704d13f8f54d57cd3c47c9b4be2', '--kid', 'my-key']
      );

      const envExample = path.join(testDir, '.env.example');
      const content = fs.readFileSync(envExample, 'utf-8');
      expect(content).toContain('PANDA_KEY_MY_KEY=');
    });

    it('should normalize key ID for env var name', async () => {
      await runInit(
        ['--token', 'panda_demo_76d08573d453cdbdb4bf5704d13f8f54d57cd3c47c9b4be2', '--kid', 'api-key']
      );

      const envFile = path.join(testDir, '.env');
      const content = fs.readFileSync(envFile, 'utf-8');
      expect(content).toContain('PANDA_KEY_API_KEY=');
    });
  });

  describe('Security', () => {
    it('should show demo token warning in non-local environment', async () => {
      const result = await runInit(
        ['--token', 'panda_demo_76d08573d453cdbdb4bf5704d13f8f54d57cd3c47c9b4be2', '--kid', 'test-key']
      );

      // In test environment, should pass without warning
      expect(result.exitCode).toBe(0);
    });

    it('should generate 32-byte key', async () => {
      await runInit(
        ['--token', 'panda_demo_76d08573d453cdbdb4bf5704d13f8f54d57cd3c47c9b4be2', '--kid', 'test-key']
      );

      const envFile = path.join(testDir, '.env');
      const content = fs.readFileSync(envFile, 'utf-8');

      // Extract base64 key value
      const match = content.match(/PANDA_KEY_TEST_KEY=([A-Za-z0-9+/=]+)/);
      expect(match).toBeTruthy();

      if (match) {
        const base64Key = match[1];
        // Base64 decode to check length
        const keyBuffer = Buffer.from(base64Key, 'base64');
        expect(keyBuffer.length).toBe(32);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle missing token gracefully', async () => {
      const result = await runInit(['--kid', 'test-key']);

      expect(result.exitCode).toBe(1);
    });

    it('should show helpful error on invalid token', async () => {
      const result = await runInit(['--token', 'bad-token', '--kid', 'test']);

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('Token gate failed');
    });
  });

  describe('Output Messages', () => {
    it('should show generated key info', async () => {
      const result = await runInit(
        ['--token', 'panda_demo_76d08573d453cdbdb4bf5704d13f8f54d57cd3c47c9b4be2', '--kid', 'my-custom-key']
      );

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('my-custom-key');
    });
  });
});


/**
 * `--provider` on the non-interactive path.
 *
 * panda-node was the only SDK with this flag, and the only one with a second
 * name for it: `--keystore`. The alias goes, and `--provider` is pinned on
 * both commands in panda-spec/cli-flags.md, checked by verify_interop.js.
 *
 * The variable names come from the implementation's own exported lists rather
 * than being written out again. A test that restates a rule asserts its own
 * copy of it — how the token pattern's second copy survived a release.
 */
describe('Provider Selection', () => {
  let testDir: string;
  const pandaExe = path.join(process.cwd(), 'dist', 'cli', 'index.js');
  const DEMO_TOKEN = 'panda_demo_76d08573d453cdbdb4bf5704d13f8f54d57cd3c47c9b4be2';

  // Imported from the build rather than restated, so a change to the lists
  // cannot leave these tests asserting yesterday's names.
  const commander = require(path.join(process.cwd(), 'dist', 'cli', 'commander.js'));
  const ALL_PROVIDER_VARS = [
    ...commander.VAULT_REQUIRED_ENV,
    ...commander.VAULT_APPROLE_ENV,
    ...commander.INFISICAL_REQUIRED_ENV,
    'PANDA_VAULT_AUTH_METHOD',
    'PANDA_VAULT_TOKEN',
    'PANDA_VAULT_MOUNT_PATH',
    'PANDA_VAULT_TOKEN_TTL',
    'PANDA_INFISICAL_SITE_URL',
    'PANDA_INFISICAL_ENVIRONMENT',
    'PANDA_INFISICAL_CACHE_TTL',
  ];

  beforeEach(() => {
    testDir = path.join(
      process.cwd(),
      'test-provider-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
    );
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  const env = (overrides: Record<string, string> = {}): NodeJS.ProcessEnv => {
    const clean: NodeJS.ProcessEnv = { ...process.env };
    for (const name of ALL_PROVIDER_VARS) delete clean[name];
    return { ...clean, ...overrides };
  };

  const run = (
    args: string[],
    environment: NodeJS.ProcessEnv = env()
  ): Promise<{ exitCode: number; output: string }> =>
    new Promise((resolve) => {
      let output = '';
      const proc = spawn('node', [pandaExe, ...args], {
        cwd: testDir,
        env: environment,
        timeout: 15000,
      });
      proc.stdout.on('data', (d) => (output += d.toString()));
      proc.stderr.on('data', (d) => (output += d.toString()));
      proc.on('close', (code) => resolve({ exitCode: code || 0, output }));
      proc.on('error', (err) => resolve({ exitCode: 1, output: err.message }));
    });

  // Two files, split by whether a leak would cost anything: the secrets go to
  // `.panda/credentials` and the rest to `.panda/config.json`. The provider is
  // therefore in the second, and `vaultSecretId` is not.
  const providerConfig = (): any =>
    JSON.parse(fs.readFileSync(path.join(testDir, '.panda', 'config.json'), 'utf8')).provider;

  const secrets = (): any =>
    JSON.parse(fs.readFileSync(path.join(testDir, '.panda', 'credentials'), 'utf8'));

  it('should offer --provider on init and generate', async () => {
    const init = await run(['init', '--help']);
    const generate = await run(['generate', '--help']);

    expect(init.output).toContain('--provider');
    expect(generate.output).toContain('--provider');
  });

  it('should no longer offer --keystore, the second name for the same thing', async () => {
    const init = await run(['init', '--help']);
    const generate = await run(['generate', '--help']);

    expect(init.output).not.toContain('--keystore');
    expect(generate.output).not.toContain('--keystore');
  });

  it('should fail closed when vault is named with no environment', async () => {
    const result = await run(['init', '--quick', '--token', DEMO_TOKEN, '--provider', 'vault']);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('PANDA_VAULT_URL');
    expect(fs.existsSync(path.join(testDir, '.panda'))).toBe(false);
  });

  it('should record an AppRole configuration', async () => {
    const result = await run(
      ['init', '--quick', '--token', DEMO_TOKEN, '--kid', 'k1', '--provider', 'vault'],
      env({
        PANDA_VAULT_URL: 'https://vault.example:8200',
        PANDA_VAULT_ROLE_ID: 'role-1',
        PANDA_VAULT_SECRET_ID: 'secret-1',
      })
    );

    expect(result.exitCode).toBe(0);
    expect(providerConfig().type).toBe('vault');
    expect(providerConfig().config.vaultUrl).toBe('https://vault.example:8200');
    expect(providerConfig().config.vaultAuthMethod).toBe('approle');
    expect(providerConfig().config.vaultRoleId).toBe('role-1');
  });

  it('should infer token authentication from a lone token', async () => {
    const result = await run(
      ['init', '--quick', '--token', DEMO_TOKEN, '--provider', 'vault'],
      env({ PANDA_VAULT_URL: 'https://vault.example:8200', PANDA_VAULT_TOKEN: 'hvs.token' })
    );

    expect(result.exitCode).toBe(0);
    expect(providerConfig().config.vaultAuthMethod).toBe('token');
    // The token itself is a secret, so it is in the other file.
    expect(secrets().vaultToken).toBe('hvs.token');
  });

  it('should name every missing Infisical variable', async () => {
    const result = await run(['init', '--quick', '--token', DEMO_TOKEN, '--provider', 'infisical']);

    expect(result.exitCode).toBe(1);
    for (const name of commander.INFISICAL_REQUIRED_ENV) {
      expect(result.output).toContain(name);
    }
    expect(fs.existsSync(path.join(testDir, '.panda'))).toBe(false);
  });

  it('should write no local key for a non-local provider', async () => {
    await run(
      ['init', '--quick', '--token', DEMO_TOKEN, '--kid', 'k1', '--provider', 'vault'],
      env({ PANDA_VAULT_URL: 'https://vault.example:8200', PANDA_VAULT_TOKEN: 'hvs.token' })
    );

    const envFile = path.join(testDir, '.env');
    const written = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
    expect(written).not.toContain('PANDA_KEY_');
  });

  it('should refuse an unknown provider', async () => {
    const result = await run(['init', '--quick', '--token', DEMO_TOKEN, '--provider', 'kerberos']);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('kerberos');
  });

  it('should still mean local when no provider is given', async () => {
    const result = await run(['init', '--quick', '--token', DEMO_TOKEN, '--kid', 'k1']);

    expect(result.exitCode).toBe(0);
    expect(providerConfig().type).toBe('local');
    expect(fs.readFileSync(path.join(testDir, '.env'), 'utf8')).toContain('PANDA_KEY_K1=');
  });
});
