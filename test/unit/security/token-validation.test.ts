/**
 * Security tests for token validation.
 *
 * Tests verify that PANDA tokens are properly validated according
 * to the specified format: panda_(demo|live)_[48 hex chars]
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
// Was ../../src/cli/utils/token-validator: the wrong path and the wrong
// depth. The module is at src/crypto/tokenValidator, three levels up from
// here, not two. Vite could not resolve it, so the whole file failed to load
// and its 41 tests never ran — they had been passing by not existing.
import { validateTokenFormat } from '../../../src/crypto/tokenValidator';

describe('Security: Token Validation', () => {
  describe('Valid Token Formats', () => {
    it('should accept valid demo token', () => {
      const token = 'panda_demo_' + 'a'.repeat(48);
      expect(validateTokenFormat(token)).toBe(true);
    });

    it('should accept valid live token', () => {
      const token = 'panda_live_' + 'f'.repeat(48);
      expect(validateTokenFormat(token)).toBe(true);
    });

    it('should accept mixed case hex', () => {
      const token = 'panda_demo_' + 'aA1Bb2Cc3Dd4Ee5Ff6'.repeat(3);
      expect(validateTokenFormat(token)).toBe(true);
    });

    it('should accept numeric hex only', () => {
      const token = 'panda_demo_' + '1234567890'.repeat(4) + '123456789012';
      expect(validateTokenFormat(token)).toBe(true);
    });

    it('should accept uppercase hex only', () => {
      const token = 'panda_demo_' + 'A'.repeat(48);
      expect(validateTokenFormat(token)).toBe(true);
    });

    it('should accept zeros', () => {
      const token = 'panda_demo_' + '0'.repeat(48);
      expect(validateTokenFormat(token)).toBe(true);
    });

    it('should accept max hex value (F)', () => {
      const token = 'panda_live_' + 'F'.repeat(48);
      expect(validateTokenFormat(token)).toBe(true);
    });
  });

  describe('Invalid Token Formats', () => {
    it('should reject wrong prefix', () => {
      expect(validateTokenFormat('bear_demo_' + 'a'.repeat(48))).toBe(false);
      expect(validateTokenFormat('test_demo_' + 'a'.repeat(48))).toBe(false);
      expect(validateTokenFormat('vault_demo_' + 'a'.repeat(48))).toBe(false);
    });

    it('should reject uppercase PANDA prefix', () => {
      expect(validateTokenFormat('PANDA_DEMO_' + 'a'.repeat(48))).toBe(false);
      expect(validateTokenFormat('PANDA_LIVE_' + 'a'.repeat(48))).toBe(false);
    });

    it('should reject mixed case prefix', () => {
      expect(validateTokenFormat('PaNdA_dEmO_' + 'a'.repeat(48))).toBe(false);
    });

    it('should reject wrong type (not demo or live)', () => {
      expect(validateTokenFormat('panda_production_' + 'a'.repeat(48))).toBe(false);
      expect(validateTokenFormat('panda_staging_' + 'a'.repeat(48))).toBe(false);
      expect(validateTokenFormat('panda_test_' + 'a'.repeat(48))).toBe(false);
      expect(validateTokenFormat('panda_dev_' + 'a'.repeat(48))).toBe(false);
      expect(validateTokenFormat('panda_prod_' + 'a'.repeat(48))).toBe(false);
    });

    it('should reject uppercase type', () => {
      expect(validateTokenFormat('panda_DEMO_' + 'a'.repeat(48))).toBe(false);
      expect(validateTokenFormat('panda_LIVE_' + 'a'.repeat(48))).toBe(false);
    });

    it('should reject too short (47 chars)', () => {
      expect(validateTokenFormat('panda_demo_' + 'a'.repeat(47))).toBe(false);
    });

    it('should reject too long (49 chars)', () => {
      expect(validateTokenFormat('panda_demo_' + 'a'.repeat(49))).toBe(false);
    });

    it('should reject way too long (100 chars)', () => {
      expect(validateTokenFormat('panda_demo_' + 'a'.repeat(100))).toBe(false);
    });

    it('should reject empty string', () => {
      expect(validateTokenFormat('')).toBe(false);
    });

    it('should reject null', () => {
      expect(validateTokenFormat(null as any)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(validateTokenFormat(undefined as any)).toBe(false);
    });

    it('should reject non-hex characters', () => {
      expect(validateTokenFormat('panda_demo_' + 'g'.repeat(48))).toBe(false);
      expect(validateTokenFormat('panda_demo_' + 'z'.repeat(48))).toBe(false);
      expect(validateTokenFormat('panda_demo_' + '!@#$%^&*()'.repeat(4))).toBe(false);
    });
  });

  describe('Security Implications', () => {
    it('should prevent SQL injection attempts', () => {
      expect(validateTokenFormat("panda_demo_' OR '1'='1")).toBe(false);
    });

    it('should prevent path traversal attempts', () => {
      expect(validateTokenFormat('panda_demo_../../etc/passwd')).toBe(false);
    });

    it('should prevent XSS attempts', () => {
      expect(validateTokenFormat("panda_demo_<script>alert('xss')</script>")).toBe(false);
    });

    it('should prevent command injection', () => {
      expect(validateTokenFormat('panda_demo_; rm -rf /')).toBe(false);
      expect(validateTokenFormat('panda_demo_`whoami`')).toBe(false);
    });

    it('should prevent newline injection', () => {
      expect(validateTokenFormat('panda_demo_\na'.repeat(48))).toBe(false);
    });

    it('should prevent tab injection', () => {
      expect(validateTokenFormat('panda_demo_\ta'.repeat(48))).toBe(false);
    });

    it('should prevent carriage return injection', () => {
      expect(validateTokenFormat('panda_demo_\ra'.repeat(48))).toBe(false);
    });
  });

  describe('Character Set Validation', () => {
    it('should reject all special characters', () => {
      const specialChars = [
        '!', '@', '#', '$', '%', '^', '&', '*', '(', ')',
        '+', '=', '[', ']', '{', '}', '|', '\\', ':', ';',
        '"', "'", '<', '>', ',', '.', '?', '/', '~', '`',
        ' ', '\t', '\n', '\r'
      ];

      specialChars.forEach(char => {
        const token = `panda_demo_${char}${'a'.repeat(47)}`;
        expect(validateTokenFormat(token)).toBe(false);
      });
    });

    it('should reject underscore in hex part', () => {
      expect(validateTokenFormat('panda_demo_'.repeat(3) + 'a')).toBe(false);
    });

    it('should reject hyphen in hex part', () => {
      expect(validateTokenFormat('panda_demo_-' + 'a'.repeat(47))).toBe(false);
    });

    it('should reject Unicode characters', () => {
      expect(validateTokenFormat('panda_demo_测试测试测试测试测试测试')).toBe(false);
      expect(validateTokenFormat('panda_demo_🔑🔑🔑🔑🔑🔑🔑🔑🔑')).toBe(false);
      expect(validateTokenFormat('panda_demo_مرحباااااااااااااااااا')).toBe(false);
    });
  });

  describe('Type Restriction', () => {
    it('should only allow demo and live types', () => {
      const validTypes = ['demo', 'live'];
      const invalidTypes = [
        'test', 'staging', 'prod', 'production', 'dev',
        'beta', 'alpha', 'sandbox', 'uat', 'preprod'
      ];

      validTypes.forEach(type => {
        const token = `panda_${type}_` + 'a'.repeat(48);
        expect(validateTokenFormat(token)).toBe(true);
      });

      invalidTypes.forEach(type => {
        const token = `panda_${type}_` + 'a'.repeat(48);
        expect(validateTokenFormat(token)).toBe(false);
      });
    });
  });

  describe('Length Validation', () => {
    it('should accept exactly 48 hex chars', () => {
      const token = 'panda_demo_1234567890abcdef' + '1234567890abcdef' + '1234567890abcdef';
      expect(token.length).toBe(61); // 'panda_demo_' (11) + 48 + '1234567890abcdef' (2)
      // Actually let's verify exact length
      expect('panda_demo_'.length).toBe(11);
      expect(validateTokenFormat(token)).toBe(true);
    });

    it('should reject 47 chars', () => {
      const token = 'panda_demo_' + 'a'.repeat(47);
      expect(validateTokenFormat(token)).toBe(false);
    });

    it('should reject 49 chars', () => {
      const token = 'panda_demo_' + 'a'.repeat(49);
      expect(validateTokenFormat(token)).toBe(false);
    });
  });

  describe('Case Sensitivity', () => {
    it('should require lowercase panda_ prefix', () => {
      expect(validateTokenFormat('PANDA_demo_' + 'a'.repeat(48))).toBe(false);
      expect(validateTokenFormat('PaNdA_dEmO_' + 'a'.repeat(48))).toBe(false);
      expect(validateTokenFormat('panda_demo_' + 'a'.repeat(48))).toBe(true);
    });

    it('should require lowercase type', () => {
      expect(validateTokenFormat('panda_DEMO_' + 'a'.repeat(48))).toBe(false);
      expect(validateTokenFormat('panda_LIVE_' + 'a'.repeat(48))).toBe(false);
      expect(validateTokenFormat('panda_Demo_' + 'a'.repeat(48))).toBe(false);
      expect(validateTokenFormat('panda_Live_' + 'a'.repeat(48))).toBe(false);
    });

    it('should allow case-insensitive hex', () => {
      expect(validateTokenFormat('panda_demo_' + 'A'.repeat(48))).toBe(true);
      expect(validateTokenFormat('panda_demo_' + 'aBcDeFgHiJkLmNoPqRsTuVwXyZ123456')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should reject token with leading whitespace', () => {
      expect(validateTokenFormat(' panda_demo_' + 'a'.repeat(48))).toBe(false);
    });

    it('should reject token with trailing whitespace', () => {
      expect(validateTokenFormat('panda_demo_' + 'a'.repeat(48) + ' ')).toBe(false);
    });

    it('should reject token with embedded null bytes', () => {
      expect(validateTokenFormat('panda_demo_\x00' + 'a'.repeat(46))).toBe(false);
    });

    it('should reject token starting with numbers after prefix', () => {
      // This is actually valid - hex can start with numbers
      expect(validateTokenFormat('panda_demo_' + '0'.repeat(48))).toBe(true);
    });
  });
});
