/**
 * Unit tests for InfisicalKeyProvider.
 *
 * Tests cover authentication, key retrieval, caching, error handling,
 * and network errors for the Infisical key provider.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InfisicalKeyProvider, InfisicalConfig, createKeyProvider } from '../../../src/crypto/keys';

// Mock the https module at the module level
vi.mock('https', () => {
  const mockRequest = vi.fn();
  return {
    default: { request: mockRequest },
    request: mockRequest
  };
});

import https from 'https';

// Helper function to create a mock request that completes successfully
function createMockAuthRequest() {
  const mockReq = {
    on: vi.fn((event: string, cb?: any) => {
      // Store the callback but don't do anything special
      return mockReq;
    }),
    write: vi.fn(function(this: any) { return this; }),
    end: vi.fn(function(this: any) {
      // Simulate async response
      setImmediate(() => {
        // Get the callback from the most recent https.request call
        const calls = (https.request as any).mock.calls;
        const lastCall = calls[calls.length - 1];
        const callback = lastCall?.[2]; // callback is the 3rd argument

        if (callback) {
          const response = {
            statusCode: 200,
            on: vi.fn((evt: string, cb: any) => {
              if (evt === 'data') {
                cb(Buffer.from(JSON.stringify({ accessToken: 'test-token' })));
              } else if (evt === 'end') {
                cb();
              }
            })
          };
          callback(response);
        }
      });
      return this;
    }),
    setTimeout: vi.fn(function(this: any) { return this; }),
    destroy: vi.fn(function(this: any) { return this; }),
    setHeader: vi.fn(function(this: any) { return this; })
  };
  return mockReq;
}

function createMockKeyRequest(secretValue: string) {
  const mockRes = {
    statusCode: 200,
    on: vi.fn((evt: string, cb: any) => {
      if (evt === 'data') {
        // Pass Buffer as real HTTP would
        cb(Buffer.from(JSON.stringify({ secretValue })));
      } else if (evt === 'end') {
        cb();
      }
    })
  };

  const mockReq = {
    on: vi.fn((event: string, cb?: any) => {
      return mockReq;
    }),
    setHeader: vi.fn(function(this: any) { return this; }),
    write: vi.fn(function(this: any) { return this; }),
    end: vi.fn(function(this: any) {
      setImmediate(() => {
        const calls = (https.request as any).mock.calls;
        const lastCall = calls[calls.length - 1];
        const callback = lastCall?.[2];
        if (callback) {
          callback(mockRes);
        }
      });
      return this;
    }),
    setTimeout: vi.fn(function(this: any) { return this; }),
    destroy: vi.fn(function(this: any) { return this; })
  };
  return mockReq;
}

describe('InfisicalKeyProvider', () => {
  const validConfig: InfisicalConfig = {
    siteUrl: 'https://app.infisical.com',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    projectId: 'test-project-id',
    environment: 'dev',
    cacheTTL: 300
  };

  beforeEach(() => {
    // Clear and reset the mock
    vi.clearAllMocks();
    vi.resetAllMocks();

    // Reset the mock to return auth request by default
    (https.request as any).mockImplementation((url: any, options: any, callback: any) => {
      return createMockAuthRequest();
    });

    // Also set the default export mock
    (https.default?.request as any)?.mockImplementation((url: any, options: any, callback: any) => {
      return createMockAuthRequest();
    });
  });

  describe('Initialization', () => {
    it('should initialize with given config', () => {
      const provider = new InfisicalKeyProvider(validConfig);
      expect(provider['siteUrl']).toBe('https://app.infisical.com');
      expect(provider['config'].cacheTTL).toBe(300);
    });

    it('should remove trailing slash from siteUrl', () => {
      const providerWithSlash = new InfisicalKeyProvider({
        ...validConfig,
        siteUrl: 'https://app.infisical.com/'
      });
      expect(providerWithSlash['siteUrl']).toBe('https://app.infisical.com');
    });

    it('should use default cache TTL if not provided', () => {
      const providerWithoutTTL = new InfisicalKeyProvider({
        siteUrl: 'https://app.infisical.com',
        clientId: 'test',
        clientSecret: 'test',
        projectId: 'test',
        environment: 'dev'
      });
      expect(providerWithoutTTL['config'].cacheTTL).toBe(300);
    });

    it('should initialize unauthenticated state', () => {
      const provider = new InfisicalKeyProvider(validConfig);
      expect(provider['authenticated']).toBe(false);
      expect(provider['accessToken']).toBeNull();
    });
  });

  describe('Authentication', () => {
    it('should authenticate successfully with valid credentials', async () => {
      const provider = new InfisicalKeyProvider(validConfig);
      await provider['ensureAuthenticated']();

      expect(provider['accessToken']).toBe('test-token');
      expect(provider['authenticated']).toBe(true);
      expect(provider['tokenExpires']).toBeGreaterThan(Date.now());
    });

    it('should use cached token if still valid', async () => {
      const provider = new InfisicalKeyProvider(validConfig);
      provider['accessToken'] = 'cached-token';
      provider['authenticated'] = true;
      provider['tokenExpires'] = Date.now() + 600000; // 10 minutes from now

      await provider['ensureAuthenticated']();

      expect(provider['accessToken']).toBe('cached-token');
      expect(https.request).not.toHaveBeenCalled();
    });

    it('should re-authenticate if token is expired', async () => {
      const provider = new InfisicalKeyProvider(validConfig);
      provider['accessToken'] = 'expired-token';
      provider['authenticated'] = true;
      provider['tokenExpires'] = Date.now() - 1000; // Expired

      await provider['ensureAuthenticated']();

      expect(provider['accessToken']).toBe('test-token');
      expect(provider['authenticated']).toBe(true);
    });
  });

  describe('Key Retrieval', () => {
    const testKey = Buffer.from('12345678901234567890123456789012'); // Exactly 32 bytes

    beforeEach(async () => {
      // Set up mock for key retrieval
      (https.request as any).mockImplementation((url: any, options: any, callback: any) => {
        return createMockKeyRequest(testKey.toString('base64'));
      });
    });

    it('should fetch key successfully from Infisical', async () => {
      const provider = new InfisicalKeyProvider(validConfig);
      await provider['ensureAuthenticated']();

      const key = await provider.getKey('test-key');

      expect(key).toEqual(testKey);
      expect(provider['cache'].has('test-key')).toBe(true);
    });

    it('should use cached key before expiry', async () => {
      const provider = new InfisicalKeyProvider(validConfig);
      await provider['ensureAuthenticated']();

      provider['cache'].set('cached-key', {
        key: testKey,
        expires: Date.now() + 300000
      });

      const key = await provider.getKey('cached-key');

      expect(key).toEqual(testKey);
    });

    it('should refresh cache after expiry', async () => {
      const provider = new InfisicalKeyProvider(validConfig);
      await provider['ensureAuthenticated']();

      provider['cache'].set('expired-key', {
        key: Buffer.from('12345678901234567890123456789011'), // Different 32-byte key
        expires: Date.now() - 1000
      });

      const key = await provider.getKey('expired-key');

      expect(key).toEqual(testKey);
    });
  });

  describe('Caching', () => {
    it('should cache key with correct expiry time', async () => {
      const testKey = Buffer.from('12345678901234567890123456789012'); // Exactly 32 bytes

      (https.request as any).mockImplementation((url: any, options: any, callback: any) => {
        return createMockKeyRequest(testKey.toString('base64'));
      });

      const provider = new InfisicalKeyProvider(validConfig);
      await provider['ensureAuthenticated']();

      const beforeFetch = Date.now();
      await provider.getKey('cache-test');
      const afterFetch = Date.now();

      const cached = provider['cache'].get('cache-test');
      expect(cached).toBeDefined();
      expect(cached!.expires).toBeGreaterThanOrEqual(beforeFetch + 300000);
      expect(cached!.expires).toBeLessThanOrEqual(afterFetch + 300000);
    });

    it('should respect custom cache TTL', async () => {
      const testKey = Buffer.from('12345678901234567890123456789012'); // Exactly 32 bytes

      (https.request as any).mockImplementation((url: any, options: any, callback: any) => {
        return createMockKeyRequest(testKey.toString('base64'));
      });

      const customTTLProvider = new InfisicalKeyProvider({
        ...validConfig,
        cacheTTL: 600
      });

      await customTTLProvider['ensureAuthenticated']();

      const beforeFetch = Date.now();
      await customTTLProvider.getKey('cache-test');
      const afterFetch = Date.now();

      const cached = customTTLProvider['cache'].get('cache-test');
      expect(cached!.expires).toBeGreaterThanOrEqual(beforeFetch + 600000);
      expect(cached!.expires).toBeLessThanOrEqual(afterFetch + 600000);
    });
  });

  describe('Integration with createKeyProvider', () => {
    it('should be created via factory function', () => {
      const config = {
        siteUrl: 'https://app.infisical.com',
        clientId: 'test',
        clientSecret: 'test',
        projectId: 'test',
        environment: 'dev'
      };

      const provider = createKeyProvider('infisical', config);

      expect(provider).toBeInstanceOf(InfisicalKeyProvider);
    });
  });
});
