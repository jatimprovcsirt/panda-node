import { InvalidTokenError } from '../errors';

/**
 * The production portal validation endpoint.
 */
const DEFAULT_VALIDATION_URL = 'https://csirt.jatimprov.go.id/panda/api/v1/tokens/validate';

/**
 * Get the validation URL from environment or default.
 */
function getValidationURL(): string {
  return process.env.PANDA_VALIDATION_URL || DEFAULT_VALIDATION_URL;
}

/**
 * Check if online validation should be skipped (test mode).
 */
function shouldSkipOnlineValidation(): boolean {
  return process.env.PANDA_SKIP_ONLINE_VALIDATION === '1';
}

/**
 * Response interface from the portal validation endpoint.
 */
interface ValidateTokenResponse {
  valid: boolean;
  applicationId?: string;
  organizationId?: string;
  reason?: 'invalid' | 'revoked' | 'already_activated';
}

/**
 * Request payload for token validation.
 */
interface ValidateTokenRequest {
  token: string;
}

/**
 * Performs a synchronous HTTPS call to validate the token against the PANDA portal.
 * This is blocking and fail-closed.
 *
 * @throws InvalidTokenError if validation fails for any reason.
 */
async function validateTokenOnline(token: string): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(getValidationURL(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token } as ValidateTokenRequest),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new InvalidTokenError(
        `PANDA portal returned unexpected status code ${response.status}. Please try again later.`
      );
    }

    const result: ValidateTokenResponse = await response.json();

    // Strictly the boolean true. `if (!result.valid)` was wrong in the
    // dangerous direction: {"valid": "false"} is a non-empty string, which is
    // truthy in JavaScript, so a response saying *no* was read as approval and
    // a key was generated. panda-go refused it, because decoding a string into
    // a Go bool fails — which is how the divergence was found.
    if (result.valid !== true) {
      switch (result.reason) {
        case 'revoked':
          throw new InvalidTokenError(
            'The provided token has been revoked by the portal administrator.'
          );
        case 'already_activated':
          throw new InvalidTokenError(
            'The provided token has already been used. Each token can only be activated once.'
          );
        default:
          throw new InvalidTokenError(
            'The provided token is invalid or not recognized by the PANDA portal.'
          );
      }
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new InvalidTokenError(
        'PANDA portal validation timed out. Unable to reach the PANDA portal for token validation. Please check your network connection and try again.'
      );
    }
    if (error instanceof InvalidTokenError) {
      throw error;
    }
    throw new InvalidTokenError(
      'Unable to reach the PANDA portal for token validation. Please check your network connection and try again.'
    );
  }
}

/**
 * Validates PANDA access tokens for the init-time token gate (FR-28/FR-29).
 *
 * Token validation behavior:
 * - Local format check is performed first (fast pre-flight).
 * - The demo token skips all online validation - no HTTP call is ever made.
 * - All other tokens require a successful portal validation check.
 *
 * This validator is used ONLY by the `init` CLI command. It is NOT used by
 * encrypt/decrypt/mask operations, which have zero portal dependency (FR-29).
 *
 * Note: because the SDK source is public, this check is a soft, social gate
 * for legitimate-usage inventory — not a cryptographic access-control boundary.
 * See Technical PRD Section 14.2.
 */
export const TOKEN_PATTERN = /^panda_(demo|live)_([a-f0-9]{48}|[a-f0-9]{64})$/;

/**
 * The static demo token shipped in .env.example and documentation.
 */
export const DEMO_TOKEN = 'panda_demo_76d08573d453cdbdb4bf5704d13f8f54d57cd3c47c9b4be2';

/**
 * Validate the given access token.
 *
 * Performs a local format check followed by portal validation (except for demo token).
 *
 * @throws InvalidTokenError if the token is missing, empty, malformed, or fails portal validation.
 */
export async function validateToken(token: string): Promise<void> {
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
      "Expected: panda_(demo|live)_<48 or 64 hex characters>\n" +
      `Got: ${token.substring(0, 20)}${token.length > 20 ? '...' : ''}`
    );
  }

  // Demo token skips all online validation - no HTTP call is ever made.
  if (isDemoToken(token)) {
    return;
  }

  // Test mode: skip online validation when PANDA_SKIP_ONLINE_VALIDATION=1
  if (shouldSkipOnlineValidation()) {
    return;
  }

  // For non-demo tokens, perform online validation.
  // This is blocking and fail-closed — if it fails, init refuses to generate a key.
  await validateTokenOnline(token);
}

/**
 * Check if the given token is the static demo token.
 */
/**
 * Is this token well-formed?
 *
 * Distinct from `validateToken`: that one is asynchronous, consults the
 * portal, and throws. This one answers a question about the string, and the
 * CLI needs it before deciding whether to warn a user that what they typed
 * looks wrong.
 *
 * It exists here rather than as a regex at each call site because it was a
 * regex at each call site — the wizard had its own copy that accepted 48 hex
 * characters where this accepts 48 or 64, so a token the rest of the tool
 * considers valid was rejected there.
 */
export function validateTokenFormat(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

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
