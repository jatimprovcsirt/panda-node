/**
 * The reported version must be the declared version.
 *
 * There was no test for this, which is why `panda --version` printed `0.1.0`
 * through every release from 0.1.0 to 0.5.3. The number lived in three places
 * — package.json, a literal in commander.ts, and a default argument in
 * telemetry.ts — and only the first was ever updated. Two of the three were
 * wrong, in the shipped package, for four minor releases.
 *
 * A version string is the easiest thing in a codebase to leave behind,
 * because nothing depends on it until somebody quotes it in a bug report.
 * These tests make it fail loudly instead.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFileSync } from 'child_process';
import * as path from 'path';

import { packageVersion } from '../../src/version';
import { TelemetryClient } from '../../src/telemetry/telemetry';
import { count, resetForTests } from '../../src/telemetry/counters';

const pkgVersion = require('../../package.json').version;

// `vi.mock` is hoisted above every import, so the mock and its recorder have
// to be created with vi.hoisted to exist by the time the factory runs.
const telemetry = vi.hoisted(() => {
  const written: string[] = [];
  // The callback is answered, and answered with a 202: flush() waits for the
  // response because the counters may only be cleared once the portal has
  // acknowledged them. A mock that never calls back would hang the await
  // rather than fail it.
  const request = (...args: any[]) => {
    const callback = args.find((a) => typeof a === 'function');
    return {
      on: () => {},
      write: (chunk: string) => written.push(chunk),
      end: () => {
        if (callback) callback({ statusCode: 202, resume: () => {} });
      },
      destroy: () => {},
    };
  };
  return { written, request };
});

vi.mock('https', () => ({
  request: telemetry.request,
  default: { request: telemetry.request },
}));

describe('Version reporting', () => {
  describe('packageVersion()', () => {
    it('reports the version declared in package.json', () => {
      expect(packageVersion()).toBe(pkgVersion);
    });

    it('does not report the 0.1.0 the CLI used to hardcode', () => {
      // Guard against the specific regression, not just any mismatch: if
      // somebody restores a literal, this says which one.
      expect(packageVersion()).not.toBe('0.1.0');
    });

    it('looks like a semver string', () => {
      expect(packageVersion()).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('the CLI', () => {
    // Spawned from dist/ rather than called in-process: the bug was in how
    // the built CLI reported itself, and the compiled require path is part of
    // what can break. `pretest` builds before this runs.
    it('reports the declared version for --version', () => {
      const cli = path.join(process.cwd(), 'dist', 'cli', 'index.js');
      const out = execFileSync('node', [cli, '--version'], { encoding: 'utf8' });
      expect(out.trim()).toBe(pkgVersion);
    });
  });

  describe('the telemetry client', () => {
    beforeEach(() => {
      telemetry.written.length = 0;
      // The client is disabled by this flag, and an inherited value would
      // make the test pass by sending nothing at all.
      delete process.env.PANDA_TELEMETRY_DISABLED;
      // The token comes from .panda/credentials in ordinary use. The
      // environment fallback is what keeps this test off the filesystem.
      process.env.PANDA_PORTAL_TOKEN = 'panda_live_' + 'a'.repeat(48);
      resetForTests();
    });

    it('reports the declared version in a usage report', async () => {
      // The version is read at report time rather than passed in by the
      // caller. When it was a default argument on a call the cipher made, it
      // said 0.1.0 for four minor releases and nothing noticed.
      count('encrypts');
      await new TelemetryClient().flush();

      expect(telemetry.written).toHaveLength(1);
      const body = JSON.parse(telemetry.written[0]);
      expect(body.sdkVersion).toBe(pkgVersion);
      expect(body.language).toBe('node');
      expect(body.eventType).toBe('usage');
    });

    it('reports the declared version in a key report', async () => {
      await new TelemetryClient().reportKey(Buffer.alloc(32));

      expect(telemetry.written).toHaveLength(1);
      const body = JSON.parse(telemetry.written[0]);
      expect(body.sdkVersion).toBe(pkgVersion);
      expect(body.eventType).toBe('key');
    });
  });
});
