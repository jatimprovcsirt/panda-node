export class PandaError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'PandaError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class EnvelopeVersionError extends PandaError {
  constructor(message: string) {
    super(message, 'UNSUPPORTED_ENVELOPE_VERSION');
    this.name = 'EnvelopeVersionError';
  }
}

export class UnsupportedAlgorithmError extends PandaError {
  constructor(message: string) {
    super(message, 'UNSUPPORTED_ALGORITHM');
    this.name = 'UnsupportedAlgorithmError';
  }
}

export class MalformedEnvelopeError extends PandaError {
  constructor(message: string) {
    super(message, 'MALFORMED_ENVELOPE');
    this.name = 'MalformedEnvelopeError';
  }
}

export class AuthenticationFailedError extends PandaError {
  constructor(message: string) {
    super(message, 'AUTHENTICATION_FAILED');
    this.name = 'AuthenticationFailedError';
  }
}

export class KeyNotFoundError extends PandaError {
  constructor(message: string) {
    super(message, 'KEY_NOT_FOUND');
    this.name = 'KeyNotFoundError';
  }
}

export class InvalidTokenError extends PandaError {
  constructor(message: string) {
    super(message, 'INVALID_TOKEN');
    this.name = 'InvalidTokenError';
  }
}
