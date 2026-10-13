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
6. Confirm the release exists: `npm view @jatimprovcsirt/panda version`
7. Add it to the table below.

Only two numbers matter, and they must match. Not another PANDA SDK's version,
not a date, not the branch.

## Released

| Version | Date | What it was |
|---|---|---|
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

## Unreleased — the token format, and a test file that never ran

No new tag yet. The next release is `0.5.1`.

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
