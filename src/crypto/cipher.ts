import { KeyProvider } from './keys';
import { Envelope } from '../envelope/envelope';
import { Masker, MaskingConfig } from '../masking/masker';
import { AuditLogger } from '../audit/logger';
import { noteOperation } from '../telemetry/report';
import {
  EnvelopeVersionError,
  UnsupportedAlgorithmError,
  MalformedEnvelopeError,
  AuthenticationFailedError
} from '../errors';
import * as crypto from 'crypto';

export class FieldCipher {
  /**
   * The telemetry client and the token are gone from this class.
   *
   * They existed so every cipher carried both and could make a network
   * request inside encrypt() and decryptRaw() — once per operation, from a
   * library whose promise is that it works without the portal. Counting is
   * now a package-level counter increment (see telemetry/report), and the
   * token comes from the credentials `panda init` wrote, at report time.
   */
  constructor(
    private readonly keys: KeyProvider,
    private readonly audit: AuditLogger = new AuditLogger()
  ) {}

  async encrypt(
    plaintext: string,
    kid: string,
    actor: string = 'system',
    field: string = 'unknown'
  ): Promise<Envelope> {
    let key: Buffer;
    try {
      key = await this.keys.getKey(kid);
    } catch (e: any) {
      this.audit.log(actor, field, kid, 'encrypt', 'key_not_found');
      throw e;
    }

    try {
      const nonce = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
      
      let ciphertext = cipher.update(plaintext, 'utf8');
      ciphertext = Buffer.concat([ciphertext, cipher.final()]);
      const tag = cipher.getAuthTag();
      const combined = Buffer.concat([ciphertext, tag]);

      const envelope = new Envelope(
        1,
        'aes-256-gcm',
        kid,
        nonce.toString('base64'),
        combined.toString('base64')
      );

      this.audit.log(actor, field, kid, 'encrypt', 'success');

      noteOperation('encrypts');

      return envelope;
    } catch (e: any) {
      this.audit.log(actor, field, kid, 'encrypt', 'encryption_failed');
      throw e;
    }
  }

  async decrypt(
    envelope: Envelope,
    actor: string = 'system',
    field: string = 'unknown',
    maskingConfig?: MaskingConfig
  ): Promise<string> {
    // The label goes in rather than being logged here as well: the shared
    // implementation logs every failure, so logging again here wrote two
    // audit entries per masked read — one of them claiming a raw decrypt.
    const rawPlaintext = await this.decryptRawImpl(envelope, actor, field, 'decrypt_masked');
    const masked = Masker.mask(rawPlaintext, maskingConfig);

    this.audit.log(actor, field, envelope.kid, 'decrypt_masked', 'success');
    noteOperation('decrypts');

    return masked;
  }

  async decryptRaw(
    envelope: Envelope,
    actor: string = 'system',
    field: string = 'unknown'
  ): Promise<string> {
    const plaintext = await this.decryptRawImpl(envelope, actor, field, 'decrypt_raw');

    this.audit.log(actor, field, envelope.kid, 'decrypt_raw', 'success');
    noteOperation('decryptsRaw');

    return plaintext;
  }

  /**
   * The shared implementation, unexported and uncounted.
   *
   * Both public methods count themselves, and count once.
   */
  private async decryptRawImpl(
    envelope: Envelope,
    actor: string,
    field: string,
    label: 'decrypt_masked' | 'decrypt_raw'
  ): Promise<string> {
    if (envelope.v !== 1) {
      this.audit.log(actor, field, envelope.kid, label, 'unsupported_envelope_version');
      throw new EnvelopeVersionError(`Unsupported envelope version: ${envelope.v}`);
    }

    if (envelope.alg.toLowerCase() !== 'aes-256-gcm') {
      this.audit.log(actor, field, envelope.kid, label, 'unsupported_algorithm');
      throw new UnsupportedAlgorithmError(`Unsupported algorithm: ${envelope.alg}`);
    }

    let key: Buffer;
    try {
      key = await this.keys.getKey(envelope.kid);
    } catch (e: any) {
      this.audit.log(actor, field, envelope.kid, label, 'key_not_found');
      throw e;
    }

    const nonce = Buffer.from(envelope.nonce, 'base64');
    if (nonce.length !== 12) {
      this.audit.log(actor, field, envelope.kid, label, 'malformed_envelope');
      throw new MalformedEnvelopeError('Invalid nonce length in envelope.');
    }

    const combined = Buffer.from(envelope.ciphertext, 'base64');
    if (combined.length < 16) {
      this.audit.log(actor, field, envelope.kid, label, 'malformed_envelope');
      throw new MalformedEnvelopeError('Invalid ciphertext length in envelope.');
    }

    const ciphertext = combined.subarray(0, combined.length - 16);
    const tag = combined.subarray(combined.length - 16);

    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAuthTag(tag);
      
      let plaintext = decipher.update(ciphertext);
      plaintext = Buffer.concat([plaintext, decipher.final()]);

      // No success entry here. The two public methods log their own, because
      // only they know which one ran.
      return plaintext.toString('utf8');
    } catch (e: any) {
      this.audit.log(actor, field, envelope.kid, label, 'auth_failure');
      throw new AuthenticationFailedError('Ciphertext decryption / authentication failed.');
    }
  }
}
