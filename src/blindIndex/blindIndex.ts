import * as crypto from 'crypto';

export class BlindIndexer {
  static normalize(plaintext: string, normalization: string): string {
    switch (normalization.toLowerCase()) {
      case 'digits':
      case 'nik':
      case 'phone':
        return plaintext.replace(/\D/g, '');
      case 'lowercase':
      case 'email':
        return plaintext.trim().toLowerCase();
      case 'trim':
        return plaintext.trim();
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
