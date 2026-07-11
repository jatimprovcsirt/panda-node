import { KeyProvider } from './keys';
import { Envelope } from '../envelope/envelope';
import { Masker, MaskingConfig } from '../masking/masker';
import { AuditLogger } from '../audit/logger';
import { TelemetryClient } from '../telemetry/telemetry';
import {
  EnvelopeVersionError,
  UnsupportedAlgorithmError,
  MalformedEnvelopeError,
  AuthenticationFailedError
} from '../errors';
import * as crypto from 'crypto';

export class FieldCipher {
  private readonly telemetry: TelemetryClient;
  private readonly telemetryToken: string | null;

  constructor(
    private readonly keys: KeyProvider,
    private readonly audit: AuditLogger = new AuditLogger(),
    telemetry?: TelemetryClient,
    telemetryToken?: string
  ) {
    this.telemetry = telemetry || new TelemetryClient();
    this.telemetryToken = telemetryToken || process.env.PANDA_PORTAL_TOKEN || null;
  }

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

      if (this.telemetryToken) {
        this.telemetry.report(this.telemetryToken, key);
      }

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
    try {
      const rawPlaintext = await this.decryptRaw(envelope, actor, field);
      const masked = Masker.mask(rawPlaintext, maskingConfig);
      this.audit.log(actor, field, envelope.kid, 'decrypt_masked', 'success');
      return masked;
    } catch (e: any) {
      throw e;
    }
  }

  async decryptRaw(
    envelope: Envelope,
    actor: string = 'system',
    field: string = 'unknown'
  ): Promise<string> {
    if (envelope.v !== 1) {
      this.audit.log(actor, field, envelope.kid, 'decrypt_raw', 'unsupported_envelope_version');
      throw new EnvelopeVersionError(`Unsupported envelope version: ${envelope.v}`);
    }

    if (envelope.alg.toLowerCase() !== 'aes-256-gcm') {
      this.audit.log(actor, field, envelope.kid, 'decrypt_raw', 'unsupported_algorithm');
      throw new UnsupportedAlgorithmError(`Unsupported algorithm: ${envelope.alg}`);
    }

    let key: Buffer;
    try {
      key = await this.keys.getKey(envelope.kid);
    } catch (e: any) {
      this.audit.log(actor, field, envelope.kid, 'decrypt_raw', 'key_not_found');
      throw e;
    }

    const nonce = Buffer.from(envelope.nonce, 'base64');
    if (nonce.length !== 12) {
      this.audit.log(actor, field, envelope.kid, 'decrypt_raw', 'malformed_envelope');
      throw new MalformedEnvelopeError('Invalid nonce length in envelope.');
    }

    const combined = Buffer.from(envelope.ciphertext, 'base64');
    if (combined.length < 16) {
      this.audit.log(actor, field, envelope.kid, 'decrypt_raw', 'malformed_envelope');
      throw new MalformedEnvelopeError('Invalid ciphertext length in envelope.');
    }

    const ciphertext = combined.subarray(0, combined.length - 16);
    const tag = combined.subarray(combined.length - 16);

    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAuthTag(tag);
      
      let plaintext = decipher.update(ciphertext);
      plaintext = Buffer.concat([plaintext, decipher.final()]);

      const plaintextStr = plaintext.toString('utf8');

      this.audit.log(actor, field, envelope.kid, 'decrypt_raw', 'success');

      if (this.telemetryToken) {
        this.telemetry.report(this.telemetryToken, key);
      }

      return plaintextStr;
    } catch (e: any) {
      this.audit.log(actor, field, envelope.kid, 'decrypt_raw', 'auth_failure');
      throw new AuthenticationFailedError('Ciphertext decryption / authentication failed.');
    }
  }
}
