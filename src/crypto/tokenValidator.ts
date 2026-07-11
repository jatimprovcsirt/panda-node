import { InvalidTokenError } from '../errors';

/**
 * Validates PANDA access tokens for the init-time token gate (FR-28/FR-29).
 *
 * Token validation is phase-dependent:
 * - Pre-portal (current): local format check only — the token must match
 *   the expected shape (panda_demo_ or panda_live_ prefix + 48 hex chars).
 * - Post-portal (Phase 6+): a synchronous HTTPS call to the portal's
 *   validation endpoint will be added here. The format check remains as a
 *   fast pre-flight; the live call is the authoritative check.
 *
 * This validator is used ONLY by the `init` CLI command. It is NOT used by
 * encrypt/decrypt/mask operations, which have zero portal dependency (FR-29).
 *
 * Note: because the SDK source is public, this check is a soft, social gate
 * for legitimate-usage inventory — not a cryptographic access-control boundary.
 * See Technical PRD Section 14.2.
 */
export const TOKEN_PATTERN = /^panda_(demo|live)_[a-f0-9]{48}$/;

/**
 * The static demo token shipped in .env.example and documentation.
 */
export const DEMO_TOKEN = 'panda_demo_76d08573d453cdbdb4bf5704d13f8f54d57cd3c47c9b4be2';

/**
 * Validate the given access token.
 *
 * Pre-portal: performs a local format check only.
 * Post-portal: will additionally call the portal validation endpoint.
 *
 * @throws InvalidTokenError if the token is missing, empty, or malformed.
 */
export function validateToken(token: string): void {
  if (!token) {
    throw new InvalidTokenError(
      "A valid PANDA access token is required to initialize a new application.\n" +
      "Provide it via --token <value> or the PANDA_ACCESS_TOKEN environment variable.\n" +
      "Register your application at the PANDA portal to obtain a token,\n" +
      "or use the demo token for local development (see .env.example)."
    );
  }

  if (!TOKEN_PATTERN.test(token)) {
    throw new InvalidTokenError(
      "The provided token does not match the expected format.\n" +
      "Expected: panda_(demo|live)_<48 hex characters>\n" +
      `Got: ${token.substring(0, 20)}${token.length > 20 ? '...' : ''}`
    );
  }

  // Pre-portal phase: format check is sufficient (Technical PRD Section 14.2).
  // Post-portal phase (Phase 6+): add live HTTPS validation call here.
  // The call would be blocking and fail-closed — if it fails, init refuses
  // to generate a key. This is the one exception to the SDK's fail-silent
  // portal interaction policy.
}

/**
 * Check if the given token is the static demo token.
 */
export function isDemoToken(token: string): boolean {
  return token === DEMO_TOKEN;
}

/**
 * Check whether the current environment appears to be a local/dev environment.
 * Used to determine whether to warn about demo token usage.
 */
export function isLocalEnvironment(): boolean {
  return process.env.NODE_ENV !== 'production' &&
    (!process.env.APP_ENV || ['local', 'dev', 'development', 'testing'].includes(process.env.APP_ENV));
}
