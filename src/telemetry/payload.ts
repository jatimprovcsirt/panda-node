import * as crypto from 'crypto';

/**
 * The telemetry payloads, as pinned in panda-spec/telemetry-format.md.
 *
 * Separate from the client that sends them, and pure, so the format can be
 * checked without a portal. `verify_interop.js` section 11 gives every SDK the
 * same counters and asserts they produce the same fields.
 *
 * It is separate for a second reason, which is the defect it exists to
 * prevent: the SDK and the portal disagreed about the field names — the SDK
 * sent `keyFingerprint`/`sdkVersion`/`language` and the portal read
 * `eventType`/`metadata` — and nothing noticed, because the endpoint was never
 * reached. A payload built in one typed place, against a written contract, is
 * a payload someone can compare against the receiver.
 */

/** The counts, each since the installation's last successful report. */
export interface Counters {
  encrypts: number;
  decrypts: number;
  decryptsRaw: number;
}

export const ZERO_COUNTERS: Counters = { encrypts: 0, decrypts: 0, decryptsRaw: 0 };

export interface UsageInput {
  token: string;
  sdkVersion: string;
  windowSeconds: number;
  counters: Counters;
}

/**
 * What this SDK calls itself in the payload.
 *
 * Not derived from `process.platform` or anything else that could differ
 * between two installations of the same SDK: the value identifies the
 * implementation, and the portal groups by it.
 */
export const LANGUAGE = 'node';

export function buildUsagePayload(input: UsageInput): string {
  // Every counter is written, including the ones at zero. Omitting an
  // unmoved counter would be indistinguishable, at the receiver, from an
  // older SDK that never sent the field — and an idle installation has to be
  // tellable from an out-of-date one.
  return JSON.stringify({
    eventType: 'usage',
    token: input.token,
    sdkVersion: input.sdkVersion,
    language: LANGUAGE,
    windowSeconds: input.windowSeconds,
    counters: {
      encrypts: input.counters.encrypts,
      decrypts: input.counters.decrypts,
      decryptsRaw: input.counters.decryptsRaw,
    },
  });
}

export function buildKeyPayload(token: string, sdkVersion: string, key: Buffer): string {
  return JSON.stringify({
    eventType: 'key',
    token,
    sdkVersion,
    language: LANGUAGE,
    keyFingerprint: keyFingerprint(key),
  });
}

/**
 * `base64(SHA-256(key bytes))` — the bytes, not their base64 text.
 *
 * Hashing the encoded form is the mistake that survives every round-trip
 * test, because the implementation agrees with itself and only disagrees with
 * the other three. A vector in `vectors.json` hashes a key whose base64
 * encoding is itself, so the two readings differ.
 *
 * The raw key never leaves the process; this is one-way and cannot be
 * inverted to a key.
 */
export function keyFingerprint(key: Buffer): string {
  return crypto.createHash('sha256').update(key).digest('base64');
}

/** The base URL every portal endpoint is derived from. */
export const PORTAL_BASE_URL = 'https://csirt.jatimprov.go.id/panda/api/v1';

/**
 * One definition of the endpoint, derived from the base above.
 *
 * Telemetry used to carry its own literal — `https://portal.panda.gov.id`,
 * a hostname that does not exist — while the token gate next door had the
 * right one. Two constants for one host is how they came apart.
 */
export const TELEMETRY_URL = `${PORTAL_BASE_URL}/telemetry`;
