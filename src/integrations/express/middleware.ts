import { FieldCipher } from '../../crypto/cipher';
import { Envelope } from '../../envelope/envelope';

export function decryptBodyFields(cipher: FieldCipher, fields: string[]) {
  return async (req: any, res: any, next: any) => {
    if (req.body && typeof req.body === 'object') {
      for (const field of fields) {
        const val = req.body[field];
        if (typeof val === 'string' && val.startsWith('{')) {
          try {
            const envelope = Envelope.fromJson(val);
            req.body[field] = await cipher.decryptRaw(envelope, 'express', field);
          } catch (e) {
            // Dual-read / shadow mode fallback: keep raw value if not valid envelope
          }
        }
      }
    }
    next();
  };
}
