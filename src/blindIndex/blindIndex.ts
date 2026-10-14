import * as crypto from 'crypto';

/**
 * Trim the Unicode White_Space set, as pinned in
 * panda-spec/blind-index-format.md.
 *
 * `String.prototype.trim()` is a different set in both directions: it strips
 * U+FEFF, which is not whitespace, and leaves U+0085 (NEL), which is. Both
 * were measured rather than assumed — see the deviation table in the spec.
 *
 * The consequence is not a failed lookup but a *wrong* one: a value with a
 * trailing NEL indexes differently here than in panda-php or panda-go, so a
 * record written by one SDK is not found by another.
 */
const WHITE_SPACE_EDGES = /^[\p{White_Space}]+|[\p{White_Space}]+$/gu;

function trimWhiteSpace(value: string): string {
  return value.replace(WHITE_SPACE_EDGES, '');
}

export class BlindIndexer {
  static normalize(plaintext: string, normalization: string): string {
    switch (normalization.toLowerCase()) {
      case 'digits':
      case 'nik':
      case 'phone':
        return plaintext.replace(/\D/g, '');
      case 'lowercase':
      case 'email':
        return trimWhiteSpace(plaintext).toLowerCase();
      case 'trim':
        return trimWhiteSpace(plaintext);
      case 'none':
      case 'raw':
      default:
        return plaintext;
    }
  }

  static generate(plaintext: string, key: string | Buffer, normalization: string = 'lowercase'): string {
    const normalized = this.normalize(plaintext, normalization);
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(normalized, 'utf8');
    return hmac.digest('base64');
  }
}
