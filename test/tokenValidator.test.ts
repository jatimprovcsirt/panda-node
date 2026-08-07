import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateToken, isDemoToken, DEMO_TOKEN } from '../src/crypto/tokenValidator';
import { InvalidTokenError } from '../src/errors';

describe('TokenValidator Tests', () => {
  beforeEach(() => {
    // Set test mode to skip online validation during unit tests
    process.env.PANDA_SKIP_ONLINE_VALIDATION = '1';
  });

  afterEach(() => {
    delete process.env.PANDA_SKIP_ONLINE_VALIDATION;
  });
  it('should validate demo token successfully', async () => {
    expect(isDemoToken(DEMO_TOKEN)).toBe(true);
    await expect(validateToken(DEMO_TOKEN)).resolves.not.toThrow();
  });

  it('should validate live token successfully', async () => {
    const liveToken = 'panda_live_76d08573d453cdbdb4bf5704d13f8f54d57cd3c47c9b4be2';
    expect(isDemoToken(liveToken)).toBe(false);
    await expect(validateToken(liveToken)).resolves.not.toThrow();
  });

  it('should validate live 64-character token successfully', async () => {
    const liveToken64 = 'panda_live_76d08573d453cdbdb4bf5704d13f8f54d57cd3c47c9b4be276d08573d453cdbd';
    expect(isDemoToken(liveToken64)).toBe(false);
    await expect(validateToken(liveToken64)).resolves.not.toThrow();
  });

  it('should throw on empty token', async () => {
    await expect(validateToken('')).rejects.toThrow(InvalidTokenError);
    await expect(validateToken('')).rejects.toThrow('required to initialize');
  });

  it('should throw on malformed token', async () => {
    await expect(validateToken('invalid_token_12345')).rejects.toThrow(InvalidTokenError);
    await expect(validateToken('invalid_token_12345')).rejects.toThrow('does not match the expected format');
  });

  it('should throw on invalid hex characters', async () => {
    await expect(validateToken('panda_live_76d08573d453cdbdb4bf5704d13f8f54d57cd3c47c9b4beG')).rejects.toThrow(InvalidTokenError);
  });
});
