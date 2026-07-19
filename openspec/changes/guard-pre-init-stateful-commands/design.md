## Context

`readConfig()` intentionally returns defaults when configuration is absent, while `getDb()` opens and migrates SQLite on demand. That is useful inside explicit initialization but unsafe as an implicit command bootstrap: `client add` could read environment credentials and select the unprobed default Keychain before `init` chose an available backend. Private-session evidence confirms this ordering, not stale Keychain bookkeeping, caused issue #55.

## Goals / Non-Goals

**Goals:**
- Make absence of either persisted backend selection or the bootstrapped database an explicit, safe precondition failure for database-backed commands.
- Fail Client operations before reading declared credential environments.
- Avoid creating partial durable state on the rejected path.
- Preserve pre-init help and non-stateful discovery surfaces.

**Non-Goals:**
- Change Keychain index representation, error taxonomy, backend probing, or worktree secret selection.
- Diagnose or repair the user's macOS login Keychain.
- Require initialization for pure help, parsing, or loaded-definition discovery that intentionally works from defaults.
- Add schema migrations or compatibility aliases.

## Decisions

1. Completed initialization requires both the persisted config file and database file because `init` selects and writes the secret backend before bootstrapping SQLite. A shared CLI preflight checks both files and returns fixed guidance when either is absent; it does not read config, create directories, open SQLite, or initialize a backend.

2. `getDb()` enforces the precondition centrally for all database-backed command paths. `client add` preserves provider validation on fresh state, then calls the same preflight before reading credential environments; list/remove call it before dependencies. This closes the credential-read ordering gap without weakening existing provider validation.

3. The failure is a usage/precondition error with stable exit code 2 and the fixed message `ctxindex is not initialized; run bun cli init`. No native backend detail is exposed because no backend effect occurs.

## Risks / Trade-offs

- [Some read-like commands previously created an empty database implicitly] → Requiring initialization makes lifecycle deterministic and matches documented workflows.
- [A config exists after a partially completed init but SQLite does not] → Stateful commands reject the partial state without creating the database; rerunning idempotent `ctxindex init` completes bootstrap.
- [A malformed existing config is still considered initialized by preflight] → Normal config loading reports its existing actionable validation error; preflight does not duplicate parsing.

## Migration Plan

Not applicable. Existing initialized installations already contain config and retain behavior.

## Open Questions

None.
