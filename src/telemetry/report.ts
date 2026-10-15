import * as crypto from 'crypto';

import { count, CounterName } from './counters';
import { TelemetryClient } from './telemetry';

/**
 * The one call the cipher makes.
 *
 * Counting and the decision to report live here rather than in the cipher, so
 * the hot path has one line and the flush policy has one definition. It used
 * to be the other way round: the cipher held a token and an HTTP client, and
 * called them.
 */

let client: TelemetryClient | null = null;

function getClient(): TelemetryClient {
  if (!client) client = new TelemetryClient();
  return client;
}

export function noteOperation(name: CounterName): void {
  if (getClient().isDisabled()) return;

  if (count(name)) {
    // Deliberately not awaited. An operation must never wait on the network,
    // and a failed report leaves the counters where they are.
    void getClient().flush();
  }
}

/** Testing seam. */
export function resetClientForTests(): void {
  client = null;
}

/**
 * Generate an encryption key, and report that one exists.
 *
 * The one definition of "a key was generated", so the event cannot be
 * forgotten at one of the call sites — which is exactly how `decrypt`, the
 * most common read path of all, came to be uncounted. Every key-producing path
 * goes through here: quick init, the wizard, `panda generate` and
 * `rotate-key`.
 */
export function newEncryptionKey(): Buffer {
  const key = crypto.randomBytes(32);
  void getClient().reportKey(key);
  return key;
}
