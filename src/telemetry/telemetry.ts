import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

import { buildKeyPayload, buildUsagePayload, TELEMETRY_URL } from './payload';
import { commit, pending, snapshot } from './counters';
import { packageVersion } from '../version';

/**
 * Ongoing telemetry reporting (FR-14, FR-16).
 *
 * IMPORTANT: this handles ONGOING telemetry only. It is opt-out via
 * `PANDA_TELEMETRY_DISABLED=1`, and it always fails silently: a DNS failure, a
 * timeout, a refused connection or any non-2xx response is swallowed and
 * never reaches the caller. The init-time token gate (FR-28/FR-29) is a
 * separate mechanism, mandatory and fail-closed, and this flag does not affect
 * it.
 *
 * What it does NOT do any more is run inside an operation. It used to be
 * called from encrypt() and decryptRaw(), which made a library whose promise
 * is that it works without the portal open a socket per operation — and the
 * cipher had to be handed a token for it, from `PANDA_PORTAL_TOKEN`, which
 * nothing in this project has ever set. The token now comes from the
 * credentials `panda init` writes, at flush time.
 */

/** What an installation is asked to report for. */
export interface TelemetryReport {
  counters: {
    encrypts: number;
    decrypts: number;
    decryptsRaw: number;
  };
  windowSeconds: number;
}

export class TelemetryClient {
  private readonly disabled: boolean;
  private flushing = false;
  private saidNoToken = false;

  constructor() {
    this.disabled =
      process.env.PANDA_TELEMETRY_DISABLED === '1' ||
      process.env.PANDA_TELEMETRY_DISABLED === 'true';
  }

  isDisabled(): boolean {
    return this.disabled;
  }

  /**
   * Report the accumulated counts, if there are any.
   *
   * Not awaited by its callers: an operation must never wait on the network.
   */
  async flush(): Promise<void> {
    if (this.disabled || this.flushing || pending() === 0) return;
    this.flushing = true;

    try {
      const token = this.accessToken();
      if (!token) {
        this.warnOnce();
        return;
      }

      const { counters, windowSeconds } = snapshot();
      const body = buildUsagePayload({
        token,
        sdkVersion: packageVersion(),
        windowSeconds,
        counters,
      });

      if (await this.post(body)) {
        // Only now. A failed report leaves the counters alone, so the next
        // one carries them — that is what keeps a portal outage from quietly
        // discarding the operations that happened during it.
        commit(counters);
      }
    } finally {
      this.flushing = false;
    }
  }

  /** Report a generated key. Sent once per key, and the only carrier of the fingerprint. */
  async reportKey(key: Buffer): Promise<void> {
    if (this.disabled) return;

    try {
      const token = this.accessToken();
      if (!token) return;
      await this.post(buildKeyPayload(token, packageVersion(), key));
    } catch {
      // Fail-silent, as above.
    }
  }

  /**
   * The access token, from where `panda init` put it.
   *
   * `PANDA_PORTAL_TOKEN` is still honoured for an application that would
   * rather hold it in the environment, but it is no longer the only source —
   * and it was the reason nothing was ever reported, because nothing sets it.
   */
  private accessToken(): string | null {
    try {
      const { readCredentials } = require('../cli/commands/utils/credentials');
      const credentials = readCredentials();
      if (credentials && credentials.token) return credentials.token;
    } catch {
      // Not initialised, or not a project. Nothing to report under.
    }
    return process.env.PANDA_PORTAL_TOKEN || null;
  }

  private warnOnce(): void {
    if (this.saidNoToken) return;
    this.saidNoToken = true;
    if (process.env.PANDA_TELEMETRY_DEBUG === '1') {
      console.warn('panda: telemetry has no access token to report under; run `panda init`.');
    }
  }

  /** @returns true when the portal acknowledged the report. */
  private post(body: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const url = new URL(TELEMETRY_URL);
        const client = url.protocol === 'https:' ? https : http;
        const req = client.request(
          url,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 2000 },
          (res) => {
            res.resume();
            resolve(!!res.statusCode && res.statusCode >= 200 && res.statusCode < 300);
          }
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
        req.write(body);
        req.end();
      } catch {
        resolve(false);
      }
    });
  }
}
