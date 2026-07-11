import { MalformedEnvelopeError } from '../errors';

export interface EnvelopeJson {
  v: number;
  alg: string;
  kid: string;
  nonce: string;
  ciphertext: string;
}

export class Envelope {
  constructor(
    public readonly v: number,
    public readonly alg: string,
    public readonly kid: string,
    public readonly nonce: string,
    public readonly ciphertext: string
  ) {}

  static fromJson(json: string): Envelope {
    let data: any;
    try {
      data = JSON.parse(json);
    } catch (e) {
      throw new MalformedEnvelopeError('Invalid JSON envelope format.');
    }

    if (!data || typeof data !== 'object') {
      throw new MalformedEnvelopeError('Invalid JSON envelope format.');
    }

    for (const field of ['v', 'alg', 'kid', 'nonce', 'ciphertext']) {
      if (data[field] === undefined) {
        throw new MalformedEnvelopeError(`Missing required envelope field: ${field}`);
      }
    }

    if (typeof data.v !== 'number') {
      throw new MalformedEnvelopeError("Envelope version ('v') must be a number.");
    }

    return new Envelope(
      data.v,
      String(data.alg),
      String(data.kid),
      String(data.nonce),
      String(data.ciphertext)
    );
  }

  toJson(): string {
    // Keep deterministic key order
    return JSON.stringify({
      v: this.v,
      alg: this.alg,
      kid: this.kid,
      nonce: this.nonce,
      ciphertext: this.ciphertext
    });
  }
}
