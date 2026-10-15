import { Counters, ZERO_COUNTERS } from './payload';

/**
 * The operation counters, and the flush trigger.
 *
 * This is what the cipher touches. It used to call an HTTP client directly,
 * once per encrypt and once per decryptRaw, which made a library whose whole
 * promise is that it works without the portal issue a network request inside
 * its hot path. Counting is now a few additions.
 *
 * The counters live in process memory. Node runs one process per installation
 * in the ordinary case; cluster mode forks workers and would need the shared
 * store the spec describes for PHP, and does not have one here.
 */

/** Whichever is reached first, per panda-spec/telemetry-format.md. */
export const FLUSH_INTERVAL_MS = 300_000;
export const FLUSH_VOLUME = 1000;

export type CounterName = 'encrypts' | 'decrypts' | 'decryptsRaw';

let counters: Counters = { ...ZERO_COUNTERS };
let windowStart = 0;

function total(c: Counters): number {
  return c.encrypts + c.decrypts + c.decryptsRaw;
}

/**
 * Record one operation. Returns true when the trigger has fired, so the
 * caller can start a flush without this module owning a timer.
 */
export function count(name: CounterName): boolean {
  if (total(counters) === 0) {
    windowStart = Date.now();
  }
  counters[name] += 1;

  if (total(counters) >= FLUSH_VOLUME) return true;
  return Date.now() - windowStart >= FLUSH_INTERVAL_MS;
}

/** A copy of the counters, and how long they have been accumulating. */
export function snapshot(): { counters: Counters; windowSeconds: number } {
  return {
    counters: { ...counters },
    windowSeconds: Math.max(0, Math.round((Date.now() - windowStart) / 1000)),
  };
}

export function pending(): number {
  return total(counters);
}

/**
 * Remove what was reported, once the portal has acknowledged it.
 *
 * Subtracting rather than zeroing keeps operations that happened while the
 * request was in flight; zeroing would discard them and nothing would say so.
 */
export function commit(sent: Counters): void {
  counters.encrypts -= sent.encrypts;
  counters.decrypts -= sent.decrypts;
  counters.decryptsRaw -= sent.decryptsRaw;
  if (total(counters) <= 0) {
    counters = { ...ZERO_COUNTERS };
    windowStart = 0;
  }
}

/** Testing seam: the counters are module state and a test needs a clean one. */
export function resetForTests(): void {
  counters = { ...ZERO_COUNTERS };
  windowStart = 0;
}
