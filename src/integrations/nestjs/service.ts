import { FieldCipher } from '../../crypto/cipher';
import { Envelope } from '../../envelope/envelope';
import { MaskingConfig } from '../../masking/masker';
import { BlindIndexer } from '../../blindIndex/blindIndex';

export class PandaService {
  constructor(public readonly cipher: FieldCipher) {}

  async encrypt(plaintext: string, kid: string, actor: string = 'nestjs', field: string = 'unknown'): Promise<Envelope> {
    return this.cipher.encrypt(plaintext, kid, actor, field);
  }

  async decrypt(envelope: Envelope, actor: string = 'nestjs', field: string = 'unknown', config?: MaskingConfig): Promise<string> {
    return this.cipher.decrypt(envelope, actor, field, config);
  }

  async decryptRaw(envelope: Envelope, actor: string = 'nestjs', field: string = 'unknown'): Promise<string> {
    return this.cipher.decryptRaw(envelope, actor, field);
  }

  generateBlindIndex(plaintext: string, key: string | Buffer, normalization: string = 'lowercase'): string {
    return BlindIndexer.generate(plaintext, key, normalization);
  }
}
