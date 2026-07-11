import { describe, it, expect, beforeEach } from 'vitest';
import { LocalKeyProvider } from '../src/crypto/keys';
import { FieldCipher } from '../src/crypto/cipher';
import { Envelope } from '../src/envelope/envelope';
import { Masker } from '../src/masking/masker';
import { BlindIndexer } from '../src/blindIndex/blindIndex';
import {
  AuthenticationFailedError,
  EnvelopeVersionError,
  UnsupportedAlgorithmError,
  MalformedEnvelopeError
} from '../src/errors';
import * as fs from 'fs';
import * as path from 'path';

describe('FieldCipher Spec Tests', () => {
  let vectors: any;

  beforeEach(() => {
    let vectorPath = path.join(__dirname, '../spec/vectors/vectors.json');
    if (!fs.existsSync(vectorPath)) {
      vectorPath = path.join(__dirname, '../../panda-spec/vectors/vectors.json');
    }
    if (!fs.existsSync(vectorPath)) {
      throw new Error(`Vectors file not found at: ${vectorPath}`);
    }
    vectors = JSON.parse(fs.readFileSync(vectorPath, 'utf8'));
  });

  it('should validate positive vectors', async () => {
    for (const vector of vectors.positive) {
      const keyProvider = new LocalKeyProvider();
      keyProvider.setKey(vector.kid, Buffer.from(vector.key, 'base64'));
      const cipher = new FieldCipher(keyProvider);

      const envelopeJson = JSON.stringify(vector.envelope);
      const envelope = Envelope.fromJson(envelopeJson);

      // 1. Decrypt raw
      const raw = await cipher.decryptRaw(envelope);
      expect(raw).toBe(vector.plaintext);

      // 2. Decrypt masked (default)
      const masked = await cipher.decrypt(envelope);
      const expectedMasked = Masker.mask(vector.plaintext);
      expect(masked).toBe(expectedMasked);

      // 3. Encrypt & decrypt roundtrip
      const newEnvelope = await cipher.encrypt(vector.plaintext, vector.kid);
      const roundtrip = await cipher.decryptRaw(newEnvelope);
      expect(roundtrip).toBe(vector.plaintext);
    }
  });

  it('should validate negative vectors', async () => {
    for (const vector of vectors.negative) {
      const keyProvider = new LocalKeyProvider();
      keyProvider.setKey(vector.kid, Buffer.from(vector.key, 'base64'));
      const cipher = new FieldCipher(keyProvider);

      const envelopeJson = JSON.stringify(vector.envelope);
      const envelope = Envelope.fromJson(envelopeJson);

      let errorClass: any;
      switch (vector.expected_error) {
        case 'AuthenticationFailed':
          errorClass = AuthenticationFailedError;
          break;
        case 'UnsupportedEnvelopeVersion':
          errorClass = EnvelopeVersionError;
          break;
        case 'UnsupportedAlgorithm':
          errorClass = UnsupportedAlgorithmError;
          break;
        case 'MalformedEnvelope':
          errorClass = MalformedEnvelopeError;
          break;
      }

      await expect(cipher.decryptRaw(envelope)).rejects.toThrow(errorClass);
    }
  });

  it('should validate blind indexing', () => {
    const key = Buffer.from("thisisasecretkeyof32byteslength!");
    
    const nik = "32-01-01-250199-0001";
    const email = " User@Example.COM  ";

    const nikIndex = BlindIndexer.generate(nik, key, 'nik');
    expect(nikIndex).toBe(BlindIndexer.generate("3201012501990001", key, 'none'));

    const emailIndex = BlindIndexer.generate(email, key, 'email');
    expect(emailIndex).toBe(BlindIndexer.generate("user@example.com", key, 'none'));
  });
});
