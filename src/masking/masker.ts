export interface MaskingConfig {
  keepLeading?: number;
  keepTrailing?: number;
  maskChar?: string;
}

export class Masker {
  static mask(plaintext: string, config: MaskingConfig = {}): string {
    const keepLeading = config.keepLeading ?? 2;
    const keepTrailing = config.keepTrailing ?? 2;
    const maskChar = config.maskChar ?? '*';

    // Using Array.from to correctly count multibyte / surrogate pairs characters (UTF-8 safe)
    const chars = Array.from(plaintext);
    const len = chars.length;

    if (len <= (keepLeading + keepTrailing)) {
      return maskChar.repeat(len);
    }

    const leading = chars.slice(0, keepLeading).join('');
    const trailing = chars.slice(len - keepTrailing).join('');
    const maskLength = len - keepLeading - keepTrailing;
    const maskedMiddle = maskChar.repeat(maskLength);

    return leading + maskedMiddle + trailing;
  }
}
