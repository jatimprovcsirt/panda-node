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

const pkgVersion = require('../../package.json').version;

// `vi.mock` is hoisted above every import, so the mock and its recorder have
// to be created with vi.hoisted to exist by the time the factory runs.
const telemetry = vi.hoisted(() => {
  const written: string[] = [];
  const request = () => ({
    on: () => {},
    write: (chunk: string) => written.push(chunk),
    end: () => {},
    destroy: () => {},
  });
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
    });

    it('reports the declared version when the caller does not pass one', async () => {
      // `cipher.ts` calls `report(token, key)` with two arguments, so this
      // default is what actually ships — it is not a branch that never runs.
      // It said 0.1.0 for four minor releases.
      const client = new TelemetryClient();
      await client.report('panda_live_' + 'a'.repeat(48), Buffer.alloc(32));

      expect(telemetry.written).toHaveLength(1);
      const body = JSON.parse(telemetry.written[0]);
      expect(body.sdkVersion).toBe(pkgVersion);
      expect(body.language).toBe('node');
    });

    it('still honours an explicit version', async () => {
      const client = new TelemetryClient();
      await client.report('panda_live_' + 'a'.repeat(48), Buffer.alloc(32), '9.9.9');

      expect(JSON.parse(telemetry.written[0]).sdkVersion).toBe('9.9.9');
    });
  });
});
