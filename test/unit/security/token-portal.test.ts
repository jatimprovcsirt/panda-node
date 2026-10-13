/**
 * Tests for the portal half of the token gate.
 *
 * There were none. `validateToken` had been calling the portal since it was
 * written, and nothing had ever asserted what it does with an answer — which
 * is how `if (!result.valid)` survived: a response of {"valid": "false"} is a
 * non-empty string, therefore truthy in JavaScript, so a body saying *no* was
 * read as approval and a key was generated. panda-go refused the same body,
 * because decoding a string into a Go bool fails, and that is what surfaced it.
 *
 * Every test here mocks `fetch`. The gate must fail closed, and the one thing
 * it must never do is read an unreachable or unintelligible portal as consent.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateToken,
  DEMO_TOKEN,
  validateTokenFormat,
} from '../../../src/crypto/tokenValidator';

const LIVE_TOKEN = 'panda_live_' + 'a'.repeat(48);
const PORTAL_URL = 'https://csirt.jatimprov.go.id/panda/api/v1/tokens/validate';

/** Make fetch answer with this body and status. Returns the call recorder. */
function portalReturns(body: unknown, status = 200) {
  const calls: Array<{ url: string; init: any }> = [];
  vi.stubGlobal('fetch', async (url: string, init: any) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (typeof body === 'string') throw new SyntaxError('Unexpected token');
        return body;
      },
    };
  });
  return calls;
}

/** Make the portal fail to answer at all. */
function portalUnreachable(error: Error) {
  const calls: Array<{ url: string; init: any }> = [];
  vi.stubGlobal('fetch', async (url: string, init: any) => {
    calls.push({ url, init });
    throw error;
  });
  return calls;
}

describe('Security: Token portal validation', () => {
  beforeEach(() => {
    // The portal path must be live for these tests; several below assert that
    // it is not consulted, using a fetch that would fail loudly if it were.
    delete process.env.PANDA_SKIP_ONLINE_VALIDATION;
    delete process.env.PANDA_VALIDATION_URL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('the happy path', () => {
    it('accepts a token the portal says is valid', async () => {
      portalReturns({ valid: true });
      await expect(validateToken(LIVE_TOKEN)).resolves.toBeUndefined();
    });

    it('POSTs the token as JSON to the portal', async () => {
      const calls = portalReturns({ valid: true });

      await validateToken(LIVE_TOKEN);

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(PORTAL_URL);
      expect(calls[0].init.method).toBe('POST');
      expect(calls[0].init.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(calls[0].init.body)).toEqual({ token: LIVE_TOKEN });
    });

    it('honours PANDA_VALIDATION_URL', async () => {
      process.env.PANDA_VALIDATION_URL = 'https://portal.test/validate';
      const calls = portalReturns({ valid: true });

      await validateToken(LIVE_TOKEN);

      expect(calls[0].url).toBe('https://portal.test/validate');
    });

    it('times the request out through an AbortSignal', async () => {
      // Five seconds: a one-time interactive step that hangs looks like a
      // freeze, and the failure has to be a refusal rather than a wait.
      const calls = portalReturns({ valid: true });

      await validateToken(LIVE_TOKEN);

      expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe('the portal refuses', () => {
    it('rejects a revoked token', async () => {
      portalReturns({ valid: false, reason: 'revoked' });
      await expect(validateToken(LIVE_TOKEN)).rejects.toThrow(/revoked/i);
    });

    it('rejects an already-activated token', async () => {
      portalReturns({ valid: false, reason: 'already_activated' });
      await expect(validateToken(LIVE_TOKEN)).rejects.toThrow(/already been used/i);
    });

    it('rejects an unrecognised reason', async () => {
      portalReturns({ valid: false, reason: 'invalid' });
      await expect(validateToken(LIVE_TOKEN)).rejects.toThrow(/not recognized/i);
    });

    it('rejects valid:false with no reason at all', async () => {
      portalReturns({ valid: false });
      await expect(validateToken(LIVE_TOKEN)).rejects.toThrow();
    });

    // The dangerous ones. Only the JSON boolean true is consent; every value
    // below is truthy in JavaScript and was previously read as approval.
    it('rejects the string "false" — a response saying no', async () => {
      portalReturns({ valid: 'false' });
      await expect(validateToken(LIVE_TOKEN)).rejects.toThrow();
    });

    it('rejects the string "true"', async () => {
      portalReturns({ valid: 'true' });
      await expect(validateToken(LIVE_TOKEN)).rejects.toThrow();
    });

    it('rejects a number', async () => {
      portalReturns({ valid: 1 });
      await expect(validateToken(LIVE_TOKEN)).rejects.toThrow();
    });

    it('rejects null', async () => {
      portalReturns({ valid: null });
      await expect(validateToken(LIVE_TOKEN)).rejects.toThrow();
    });

    it('rejects an object', async () => {
      portalReturns({ valid: {} });
      await expect(validateToken(LIVE_TOKEN)).rejects.toThrow();
    });

    it('rejects a body with no valid field', async () => {
      portalReturns({ status: 'ok' });
      await expect(validateToken(LIVE_TOKEN)).rejects.toThrow();
    });
  });

  describe('fail closed', () => {
    it('rejects a network failure', async () => {
      portalUnreachable(new TypeError('fetch failed'));
      await expect(validateToken(LIVE_TOKEN)).rejects.toThrow(/unable to reach/i);
    });

    it('rejects a timeout', async () => {
      const abort = new Error('The operation was aborted');
      abort.name = 'AbortError';
      portalUnreachable(abort);
      await expect(validateToken(LIVE_TOKEN)).rejects.toThrow(/timed out/i);
    });

    it('rejects a 500', async () => {
      portalReturns({ valid: true }, 500);
      await expect(validateToken(LIVE_TOKEN)).rejects.toThrow(/500/);
    });

    it('rejects a 404', async () => {
      portalReturns({ valid: true }, 404);
      await expect(validateToken(LIVE_TOKEN)).rejects.toThrow(/404/);
    });

    it('rejects a body that is not JSON', async () => {
      // What a captive portal or a block page returns.
      portalReturns('<html><body>Blocked</body></html>');
      await expect(validateToken(LIVE_TOKEN)).rejects.toThrow();
    });
  });

  describe('the escape hatches', () => {
    it('makes no request for the demo token', async () => {
      const calls = portalUnreachable(new Error('no request should be made'));
      await expect(validateToken(DEMO_TOKEN)).resolves.toBeUndefined();
      expect(calls).toHaveLength(0);
    });

    it('makes no request when PANDA_SKIP_ONLINE_VALIDATION=1', async () => {
      process.env.PANDA_SKIP_ONLINE_VALIDATION = '1';
      const calls = portalUnreachable(new Error('no request should be made'));
      await expect(validateToken(LIVE_TOKEN)).resolves.toBeUndefined();
      expect(calls).toHaveLength(0);
    });

    it('sends a panda_demo_ token that is not the static one to the portal', async () => {
      // The prefix is not a pass. Only the published string skips the portal,
      // or anyone could mint one locally.
      const calls = portalReturns({ valid: true });
      await validateToken('panda_demo_' + 'a'.repeat(48));
      expect(calls).toHaveLength(1);
    });
  });

  describe('failures before the portal', () => {
    it('never sends an empty token', async () => {
      const calls = portalUnreachable(new Error('no request should be made'));
      await expect(validateToken('')).rejects.toThrow();
      expect(calls).toHaveLength(0);
    });

    it('never sends a malformed token', async () => {
      const calls = portalUnreachable(new Error('no request should be made'));
      await expect(validateToken('panda_live_' + 'A'.repeat(48))).rejects.toThrow();
      expect(calls).toHaveLength(0);
    });

    it('never sends a token with a trailing newline', async () => {
      const calls = portalUnreachable(new Error('no request should be made'));
      await expect(validateToken(LIVE_TOKEN + '\n')).rejects.toThrow();
      expect(calls).toHaveLength(0);
    });

    it('names the expected format in the error', async () => {
      process.env.PANDA_SKIP_ONLINE_VALIDATION = '1';
      await expect(validateToken('nonsense')).rejects.toThrow(/48 or 64/);
    });
  });

  describe('the trailing newline, which the engines disagree about', () => {
    // In Python and PCRE, `$` also matches before a trailing newline, so this
    // string was a valid token in panda-py and panda-php while Node and Go
    // rejected it. A token read from a file carries one routinely. Node's `$`
    // never had the quirk; this pins that it still does not.
    it('rejects a trailing LF, CR, and CRLF', () => {
      expect(validateTokenFormat(LIVE_TOKEN)).toBe(true);
      expect(validateTokenFormat(LIVE_TOKEN + '\n')).toBe(false);
      expect(validateTokenFormat(LIVE_TOKEN + '\r')).toBe(false);
      expect(validateTokenFormat(LIVE_TOKEN + '\r\n')).toBe(false);
      expect(validateTokenFormat('\n' + LIVE_TOKEN)).toBe(false);
    });
  });
});
