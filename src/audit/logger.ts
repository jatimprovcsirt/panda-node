export interface Logger {
  info(message: string): void;
}

export class ConsoleLogger implements Logger {
  info(message: string): void {
    console.info(message);
  }
}

export class NullLogger implements Logger {
  info(message: string): void {}
}

export interface AuditEvent {
  timestamp: string;
  actor: string;
  field: string;
  kid: string;
  eventType: 'decrypt_masked' | 'decrypt_raw' | 'encrypt' | 'rotate' | 'shred';
  outcome: 'success' | 'auth_failure' | 'malformed_envelope' | 'key_not_found' | 'encryption_failed' | 'unsupported_envelope_version' | 'unsupported_algorithm';
  [key: string]: any;
}

export class AuditLogger {
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || new NullLogger();
  }

  log(
    actor: string,
    field: string,
    kid: string,
    eventType: AuditEvent['eventType'],
    outcome: AuditEvent['outcome'],
    extra: Record<string, any> = {}
  ): void {
    const event: AuditEvent = {
      timestamp: new Date().toISOString(),
      actor,
      field,
      kid,
      eventType,
      outcome,
      ...extra
    };

    this.logger.info(JSON.stringify(event));
  }
}
