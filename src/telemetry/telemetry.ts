import * as http from 'http';

import { packageVersion } from '../version';
import * as https from 'https';
import * as crypto from 'crypto';

/**
 * Fail-silent ongoing telemetry client (FR-14, FR-16).
 *
 * IMPORTANT: This client handles ONGOING telemetry only — it is opt-out via
 * PANDA_TELEMETRY_DISABLED=1, and always fails silently without blocking
 * encrypt/decrypt operations.
 *
 * The init-time token gate (FR-28/FR-29) is a SEPARATE mechanism implemented
 * in TokenValidator and the CLI init command. It is mandatory, fail-closed, and
 * NOT affected by the PANDA_TELEMETRY_DISABLED flag. See Technical PRD
 * Section 14 (comparison table) for the deliberate separation.
 */
export class TelemetryClient {
  private static readonly DEMO_TOKEN = 'panda_demo_76d08573d453cdbdb4bf5704d13f8f54d57cd3c47c9b4be2';
  private static readonly TELEMETRY_URL = 'https://portal.panda.gov.id/api/telemetry';

  private readonly disabled: boolean;

  constructor() {
    // This opt-out flag governs ONLY this ongoing telemetry client.
    // It has NO effect on the mandatory init-time token gate (FR-28).
    this.disabled = process.env.PANDA_TELEMETRY_DISABLED === '1' || process.env.PANDA_TELEMETRY_DISABLED === 'true';
  }

  async report(token: string, keyBytes: Buffer, sdkVersion: string = packageVersion()): Promise<void> {
    if (this.disabled) {
      return;
    }

    if (token === TelemetryClient.DEMO_TOKEN) {
      const isLocal = process.env.NODE_ENV !== 'production' &&
        (!process.env.APP_ENV || ['local', 'dev', 'development', 'testing'].includes(process.env.APP_ENV));
      
      if (!isLocal) {
        console.warn("⚠️ PANDA WARNING: The static DEMO TOKEN is being used outside a local development environment. Please register your agency to get a live token!");
      }
    }

    try {
      const fingerprint = crypto.createHash('sha256').update(keyBytes).digest('hex');
      const payload = JSON.stringify({
        token,
        keyFingerprint: fingerprint,
        sdkVersion,
        language: 'node'
      });

      const url = new URL(TelemetryClient.TELEMETRY_URL);
      const client = url.protocol === 'https:' ? https : http;

      const req = client.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 2000 // 2 second timeout
      });

      req.on('error', () => {
        // Fail-silent: ignore request errors
      });

      req.on('timeout', () => {
        req.destroy();
      });

      req.write(payload);
      req.end();
    } catch (e) {
      // Fail-silent
    }
  }
}
