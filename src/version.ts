/**
 * The version of this package, read from package.json.
 *
 * One definition, in the place the build already keeps the number.
 *
 * The version lived in three places: package.json, a string literal in
 * commander.ts, and a default argument in telemetry.ts. Both literals said
 * `0.1.0` and neither was ever updated, so `panda --version` reported 0.1.0
 * through every release from 0.1.0 to 0.5.3, and the telemetry client
 * reported a version that had not been current for four minor releases.
 *
 * Nothing caught it because nothing asserted it. That is the same shape as
 * the token pattern, the blind index encoding, and the M003 lint rule: a
 * value that has to be shared, kept in more than one copy, with no check that
 * the copies agree. The fix is the same — one definition, and something that
 * fails when it stops matching.
 *
 * The path works from both `src/` and `dist/`, which are the only two
 * directories this file is ever loaded from, and both sit one level below the
 * package root. A deeper path would need counting directory levels, which is
 * how the copy in the CLI layer ended up four `../` deep.
 */
export function packageVersion(): string {
  try {
    const pkg = require('../package.json');
    return typeof pkg.version === 'string' && pkg.version.length > 0
      ? pkg.version
      : '0.0.0';
  } catch {
    // A version string is not worth crashing a CLI over. 0.0.0 is visibly
    // wrong, which is what we want if this ever stops resolving.
    return '0.0.0';
  }
}
