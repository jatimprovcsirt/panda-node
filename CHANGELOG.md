# Changelog

## Read this before creating a tag

**The version in `package.json` and the git tag must be the same number.**

A tag whose name disagrees with the declared version is a *stray tag*. It costs
nothing to create and a great deal to be confused by: npm and every consumer
treat the tag's number as the release, so the package ends up claiming a
version the repository never declared. One PANDA repository has already done
this — see `panda-php`'s changelog for what it cost.

Before tagging:

1. **Read this file.** It records what has been released and what the next
   number is.
2. Set that number in `package.json`.
3. Commit the version bump on its own, so the tag points at a release-only
   commit.
4. Tag the same number with a `v` prefix — `0.5.1` in `package.json` means
   `v0.5.1` as the tag, never anything else.
5. Push the branch, then the tag.
6. Confirm the release exists: `npm view @jatimprovcsirt/panda-node version`
7. Add it to the table below.

Only two numbers matter, and they must match. Not another PANDA SDK's version,
not a date, not the branch.


## Licence: MIT to Apache-2.0

Every repository now carries a verbatim Apache License 2.0 and a NOTICE file
naming the copyright holder. Four of the six had no licence file at all, and
`panda-node` had no `license` field in its manifest either — it declared
nothing while listing a `LICENSE` in `files` that did not exist, so what npm
actually published was unlicensed.

Apache-2.0 over MIT for one reason: an express patent grant. MIT is silent on
patents, and this is cryptographic software that other organizations and vendors are
expected to embed in their own systems — the grant, and the retaliation clause
that comes with it, is the part that matters when a third party deploys it.
Apache-2.0 is no less permissive, so nothing about adoption gets harder.

GPL was considered and rejected: copyleft would block exactly the cross-agency
adoption this project exists for, and sit badly with public procurement.

**What is already published does not change.** A licence cannot be altered
retroactively on an artifact that has been released, so panda-py 0.2.1-0.2.3 on
PyPI and panda-php 0.2.1-0.2.2 on Packagist stay MIT, panda-node 0.5.0 on npm
stays unlicensed, and the Go tags through v0.5.1 carry no licence text
either. This applies from the next release of each.

The `LICENSE` file is the canonical text byte-for-byte — verified against its
published SHA-256, `cfc7749b...523d30` — so it stays comparable to every other
copy of it.

## Released

| Version | Date | What it was |
|---|---|---|
| `0.5.7` | 2026-10-15 | Telemetry counts instead of calling out per operation; the audit label now matches the path taken. |
| `0.5.6` | 2026-10-14 | `--provider` on `init` and `generate`. `--keystore`, its second name, is gone. |
| `0.5.5` | 2026-10-14 | Blind index trimming used JavaScript's `trim()`, which is a different set from the spec's. |
| `0.5.4` | 2026-10-14 | `panda --version` and the telemetry payload reported a hardcoded `0.1.0`. |
| `0.5.3` | 2026-10-14 | First release to reach npm since 0.5.0. Publishes with OIDC instead of a token. Supersedes `0.5.1` and `0.5.2`. |
| `0.5.2` | 2026-10-13 | `npm test` never built first, so the suite failed on any fresh clone — including CI. **Tagged but never published** — its workflow could not authenticate. |
| `0.5.1` | 2026-10-13 | The portal gate read `{"valid": "false"}` as approval; the token tests had never run. **Tagged but never published** — its own workflow failed. |
| `0.5.0` | 2026-08-16 | CLI non-interactive mode documentation. |
| `0.4.2` | 2026-08-16 | Version bump. |
| `0.1.5` | 2026-08-14 | Author name correction. |
| `0.4.1` | 2026-08-14 | Author name correction. |
| `0.4.0` | 2026-08-13 | Vault AppRole auto-renewal and token TTL configuration. |
| `0.1.4` | 2026-08-10 | Version bump. |
| `0.1.3` | 2026-08-08 | CLI bin entry, async tests, prepublish hook. |
| `0.1.2` | 2026-08-07 | `tsconfig.json` module resolution. |
| `0.1.1` | 2026-07-18 | 48/64 hex token support. |
| `0.1.0` | 2026-07-11 | First tag. |

## 0.5.1 was tagged and never published

The tag exists. No version of it ever reached npm, and that is not a mistake in
the tag — it is the tag doing its job.

Pushing it triggered the release workflow, which runs `npm ci`, then
`npm run test`, then `npm run build`, then `npm publish`. The test step failed,
so nothing was published. The lockfile was the first problem and was fixed in
the release commit; this was the second, and it was only visible once the
workflow could get far enough to reach it:

**`npm test` never built anything.** The script was `vitest run` and nothing
else, and four test files spawn `node dist/cli/index.js`. On a developer's
machine `dist/` is usually already there and nobody notices. On a fresh clone
there is no `dist/`, and 79 of 200 tests fail. The release workflow builds
*after* testing, so it could never have passed.

That was true before this release, which means `panda-node` has not been
releasable by tag for as long as those tests have existed. `0.5.0` on npm was
not published by this workflow.

The fix is a `pretest` script, which npm runs automatically before `test`, so
the suite is correct for a contributor as well as for CI — rather than
reordering the workflow, which would have hidden it from everyone else.

`v0.5.1` was left where it is rather than moved. Re-pointing a tag that has
already been pushed is the operation that produced `panda-php`'s stray tag, and
a tag that records a failed release is more honest than one quietly rewritten
to look like it worked. `0.5.2` carries the same changes plus the fix.

## 0.5.3 shipped reporting itself as 0.1.0

Found by installing 0.5.3 from npm into an empty project and running it, which
is the only way this was ever going to be found. `panda --version` printed
`0.1.0`.

The version lived in three places: `package.json`, a string literal in
`commander.ts`, and a default argument in `telemetry.ts`. The first was
maintained and the other two were not, so the CLI and the telemetry payload
both reported `0.1.0` — through every release from 0.1.0 to 0.5.3.

The telemetry one is the quieter of the two. `cipher.ts` calls
`report(token, key)` with two arguments, so the default argument is what
actually ships; every telemetry record this SDK has ever sent carried a
version that had not been current for four minor releases.

A correct reader already existed — `cliVersion()` in the credential utilities,
four `../` deep — and was used for exactly one field. It is now `src/version.ts`
at the package root, used by all three callers, and the private copy is gone.

Nothing caught this because nothing asserted it. Six tests now do: the shared
reader, the spawned CLI's `--version` output, and the telemetry payload. Both
failures were confirmed by putting the literals back — each fails with
`expected '0.1.0' to be '0.5.4'`.

This is the sixth instance of the same defect in this project, and the third
where the second copy lived in a place nothing executed: the token pattern, the
M003 lint rule, and now a version string.

## Three tags for one release

`0.5.1`, `0.5.2` and `0.5.3` all carry the same change — the token gate reading
`{"valid": "false"}` as approval, and the token tests that had never run. Each
of the first two was tagged, and each failed in its own workflow for a
different reason:

| Tag | Failed at | Why |
|---|---|---|
| `v0.5.1` | Run Tests | `npm test` never built `dist/`, so 79 of 200 tests failed on a fresh clone |
| `v0.5.2` | Publish to npm | `NODE_AUTH_TOKEN` could not write to the scope — `E404` |
| `v0.5.3` | — | publishes with OIDC |

That is one release's worth of version numbers spent on two defects and one
dead credential, and it is worth recording because neither of the first two
failures was visible from the repository: both needed the workflow to run.

`v0.5.1` and `v0.5.2` were left where they are rather than moved. Re-pointing a
pushed tag is the operation that produced `panda-php`'s stray tag, and a tag
recording a failed release is more honest than one rewritten to look like it
worked. `panda-py`'s `v0.2.0` is the precedent.

`0.5.3` is the first release here to publish with OIDC trusted publishing
rather than a token. `secrets.NPM_TOKEN` is no longer read by anything.

## Why there are two version lines

The tags run `0.1.0`–`0.1.4`, then `0.4.0`, `0.4.1`, `0.4.2`, `0.5.0` — with
`0.1.5` appearing *between* `0.4.1` and `0.4.2` on the same day, 14 August.

So the version was re-based mid-series: work continued on `0.1.x` for a while
after `0.4.0` had been tagged. Nothing is broken by that — every tag matches
the `package.json` at its own commit — but it means the numbers do not tell you
the order things happened in, and `0.1.5` is *newer* than `0.4.1`.

`0.5.0` is the tip of the line that continues. If the numbering is ever
re-based again, say so here rather than leaving the next person to work it out
from dates.


## What 0.5.6 adds

### `--provider` on `init` and `generate`

`panda-node` had this flag and the other three did not, so `init --quick` could
only ever configure the local provider: **Vault and Infisical were unreachable
from a CI pipeline here.** A team provisioning into Vault from a build could do
it in Node.js and not in the language they were actually using.

It is the sixth instance of this project's recurring defect — a shared rule
with more than one definition. Five `init` flags were uniform before it, and
each became uniform the same way: added to all four in turn, each time after
noticing one SDK had it and another did not. The set is now pinned in
`panda-spec/cli-flags.md`, and `verify_interop.js` section 10 runs `--help` in
all four SDKs and asserts every pinned name appears. Reverting this release's
change fails exactly the two checks written for it.

### Provider settings come from the environment, and are required

`--provider` names the provider; it does not carry its settings, and on this
path there is nobody to ask. The variables are the ones `CLAUDE.md` and the
provider classes already use — `PANDA_VAULT_URL` and either
`PANDA_VAULT_ROLE_ID` + `PANDA_VAULT_SECRET_ID` or `PANDA_VAULT_TOKEN` for
Vault; `PANDA_INFISICAL_CLIENT_ID`, `PANDA_INFISICAL_CLIENT_SECRET` and
`PANDA_INFISICAL_PROJECT_ID` for Infisical.

`PANDA_VAULT_AUTH_METHOD` is inferred when it is not set: role and secret means
`approle`, a token means `token`, neither is an error naming the variable.

**A missing required variable exits 1 and writes nothing** — no `.panda`
directory, no `.env`, no key. The wizard may offer a localhost default because
a person is there to see it and disagree; `--quick` cannot ask, and a
credentials file naming a Vault that nothing said to use behaves like a working
configuration until the first decrypt. The refusal names every variable that is
missing, not the first.

### No local key is written for a non-local provider

A key generated "for" a secret manager is a second key that nothing reads, and
it would be the one in `.env` that a later `panda generate` does not know
about. `--skip-key-gen` therefore has nothing to suppress on this path.

### Submodule pin moves to `panda-spec` v4

The tag that carries `cli-flags.md` and the tenth interop section.

### `--keystore` is gone

This SDK was the only one with the flag, under two names. On `init` it was an
alias for `--provider`; on `generate` it was a provider override that *also*
forced the non-interactive path, because that path was chosen with
`options.yes || options.keystore`. Two names for one concept is two definitions
of it, and `cli-flags.md` pins one.

### Eight options were read that were never declared

`setupVaultProvider` and `setupInfisicalProvider` read `options.vaultUrl`,
`options.vaultToken`, `options.vaultMount`, `options.infisicalSiteUrl` and four
more. None of them was registered with commander, so every one of those reads
was `undefined` and fell through to the environment. The code said the flag
existed; the definition said it did not. The reads are gone and the environment
is required instead of defaulted.

### `.panda` is no longer created before the token gate

It was the first thing quick mode did, so a refused token left an empty
`.panda` behind — a project that looks initialised to anything that only checks
for the directory, and is not. The other three SDKs write nothing when they
refuse, and this now matches.


## What 0.5.7 changes

### Telemetry no longer runs inside an operation

The cipher called an HTTP client directly, from `encrypt()` and from the
full-plaintext decrypt — once per operation. A library whose promise is that it
works without the portal was opening a socket in its hot path, and it had to be
handed a token to do it, taken from `PANDA_PORTAL_TOKEN`, **which nothing in
this project has ever set**. So the calls never fired: two independent reasons
for the same silence.

Counting is now an addition to a counter. Reporting happens on a window
boundary — whichever of 300 seconds or 1000 operations comes first — and the
token comes from the credentials `panda init` wrote.

What is sent is pinned in `panda-spec/telemetry-format.md`: three counters
(encrypts, decrypts, raw decrypts) and the SDK version, and on key generation
a one-way fingerprint. No plaintext, no ciphertext, no key material, no field
name, no field value, no record identifier.

### The endpoint had two definitions and they disagreed

This SDK posted telemetry to `https://portal.panda.gov.id/api/telemetry` — a
hostname that does not resolve — while the token gate next door held the
correct one. Both are now derived from a single base URL constant.

### The audit trail said "decrypt_raw" for operations that were not

`decrypt()` calls `decryptRaw()`. The shared implementation logged
`decrypt_raw` on every outcome, and `decrypt` logged `decrypt_masked` on top.
So every masked read wrote **two** audit entries, one of them asserting a raw
decrypt that never happened — and a *failed* masked read wrote only the false
one, leaving it indistinguishable from a failed raw read.

`decryptRaw` is documented as "explicitly logged as a distinct audit event". It
was not distinct, and the log was dominated by raw-decrypt entries for
operations that never decrypted anything raw. The shared implementation now
takes the label, and each public method logs its own outcome exactly once.

### `verify_interop.js` section 11

Every implementation is given the same counters and must produce the same JSON:
224 checks across all four SDKs, up from 200.

### An API change

The cipher no longer takes a telemetry client or a token — there is no client
to hold. Callers that passed them will get a compile error, which is the
correct outcome for an argument that no longer has a meaning.

### Key generation is reported once per key

Every path that produces a key — quick init, the wizard, `generate` and
`rotate-key` — now goes through one function that generates the key and
reports it. Adding the report at each call site would have repeated the defect
this whole change is about: a rule defined by where somebody remembered to
write it, which is how `decrypt` came to be uncounted in the first place.

### `providerToken` is gone from `PandaModuleOptions`

It existed only to hand the cipher a token for telemetry, and telemetry never
ran. An option that is accepted and discarded is worse than one that is absent.

## What 0.5.1 fixes

### The token format, and a test file that never ran

`token-validation.test.ts` imported `../../src/cli/utils/token-validator` — a
path that does not exist, at the wrong depth as well as the wrong location. The
module is at `src/crypto/tokenValidator`, three levels up. Vite could not
resolve it, so the whole file failed to load and its 41 tests never ran. They
had been passing by not existing, which is the most comfortable way for a test
to pass.

Fixing the import turned six of them red, and they were red for a good reason.
Four asserted that uppercase and mixed-case hex are *accepted*. No
implementation has ever accepted them, and `panda-spec/token-format.md` now
says so explicitly: a token is compared byte-for-byte against what the portal
issued, so accepting both spellings would let a token pass the local check and
then fail at the portal. The tests were the only dissent — and the only ones
that had never been executed.

Two more were wrong on arithmetic rather than policy: one asserted a 61-
character token length for a 59-character string, and the comment explaining it
counted a group that is not in the string.

The other fifteen failures were the harness, not the implementation.
`credential-storage.test.ts` drove the wizard with `stdin.write(input)` followed
by `stdin.end()`, and readline drops a line that arrives with no question
pending — so only the first prompt was ever answered, the wizard waited for
input that had already been sent, and the process exited having written nothing.

Also in this change:

- `TOKEN_PATTERN` and the token helpers are exported from the package root.
  They were reachable only from the CLI, while `panda-go` and `panda-php`
  expose theirs.
- `src/index.ts` now exports them so the cross-language vector runner has
  something to call.

173 tests pass. Before this, 109 passed and 23 failed.

### A response saying "no" was read as approval

Found while writing tests for the portal call, which had never had any.

`validateToken` checked the portal's answer with `if (!result.valid)`. A
non-empty string is truthy in JavaScript, so `{"valid": "false"}` — a response
explicitly saying the token is not valid — was read as approval and a key was
generated. So were `{"valid": "no"}` and `{"valid": 1}`.

`panda-go` refused all of them, because decoding a JSON string into a Go `bool`
fails. It was the only one of the four that was right, and that disagreement is
how the bug became visible.

The check is now `result.valid !== true`. Only the JSON boolean `true` is
consent; every other value, including the string `"true"`, is a refusal.

`test/unit/security/token-portal.test.ts` is new: 27 tests covering the happy
path, each refusal reason, every truthy-but-not-true value, and fail-closed
behaviour for a timeout, a refused connection, a 500, a 404 and an HTML body.
Everything is mocked, so the result does not depend on whether a live portal is
reachable.

Also pinned: `panda_demo_<48 hex>` with a trailing newline is rejected. In
Python and PCRE, `$` also matches before a final newline, so those bytes were a
valid token in `panda-py` and `panda-php` and invalid here and in `panda-go`.
Node's `$` never had the quirk; the test keeps it that way.

200 tests pass.
