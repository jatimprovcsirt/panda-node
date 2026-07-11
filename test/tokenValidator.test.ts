import { describe, it, expect } from 'vitest';
import { validateToken, isDemoToken, DEMO_TOKEN } from '../src/crypto/tokenValidator';
import { InvalidTokenError } from '../src/errors';

describe('TokenValidator Tests', () => {
  it('should validate demo token successfully', () => {
    expect(isDemoToken(DEMO_TOKEN)).toBe(true);
    expect(() => validateToken(DEMO_TOKEN)).not.toThrow();
  });

  it('should validate live token successfully', () => {
    const liveToken = 'panda_live_76d08573d453cdbdb4bf5704d13f8f54d57cd3c47c9b4be2';
    expect(isDemoToken(liveToken)).toBe(false);
    expect(() => validateToken(liveToken)).not.toThrow();
  });

  it('should throw on empty token', () => {
    expect(() => validateToken('')).toThrow(InvalidTokenError);
    expect(() => validateToken('')).toThrow('required to initialize');
  });

  it('should throw on malformed token', () => {
    expect(() => validateToken('invalid_token_12345')).toThrow(InvalidTokenError);
    expect(() => validateToken('invalid_token_12345')).toThrow('does not match the expected format');
  });

  it('should throw on invalid hex characters', () => {
    expect(() => validateToken('panda_live_76d08573d453cdbdb4bf5704d13f8f54d57cd3c47c9b4beG')).toThrow(InvalidTokenError);
  });
});
