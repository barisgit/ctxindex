# scripts/

## Responsibility

Provides repository-level executable tooling: policy verification gates under `scripts/verify/`, bounded process supervision in `scripts/with-timeout.ts`, and helper-created worktree isolation through `scripts/worktree-new.sh` and `scripts/cli.sh`.

## Design/patterns

- Verification scripts are deterministic command-line gates: they scan production source/config, optionally spawn or import runtime targets, print findings, and signal success or failure by exit status. The full-suite wrapper installs a temporary Keychain mock; completed milestone architecture assertions live in normal discovered tests rather than exhausted red contracts. See `scripts/verify/codemap.md`.

- `with-timeout.ts` is a process-supervisor wrapper. It runs a command in a detached process group where supported, forwards terminal streams/signals, and applies TERM-then-KILL timeout escalation.

- Worktree isolation uses an ignored `.ctxindex/worktree` marker. The root CLI launcher detects that marker and overrides both `CTXINDEX_*_HOME` and `XDG_*_HOME` to worktree-local config, data, state, and cache directories; without it, caller-provided paths are preserved.

## Data & control flow

1. Package scripts or operators invoke a verifier or `bun scripts/with-timeout.ts <timeoutSecs> [--] <cmd> [args...]`.
2. Verifiers inspect discovered production paths, workspace imports/manifests, and package exports, then return contract-specific status output and exit codes.
3. `with-timeout.ts` parses the CLI timeout, optionally overrides it from `TEST_WALL_TIMEOUT_SECS`, spawns the child, and normally propagates its exit code. On timeout it signals the process group with `SIGTERM`, waits up to `KILL_GRACE_MS`, escalates to `SIGKILL`, and exits `124`; incoming `SIGINT`/`SIGTERM` are forwarded with exits `130`/`143`.
4. `scripts/worktree-new.sh` accepts only `feature`, `fix`, `docs`, or `chore` branches, preflights existing refs for marker-aware CLI wiring before attach, and creates the isolated directories and marker. Root-level `bun cli` / `bun run cli` then invokes `scripts/cli.sh`, which launches `apps/cli/bin/ctxindex.mjs` with isolated paths.

## Integration points

- Root `package.json` exposes `cli` through `scripts/cli.sh`, `with-timeout`, and `ci`; `cli` is the supported isolated entry point in helper-created worktrees.
- Verification targets include every `apps/*` and `packages/*` workspace, their manifests, CLI/core/Adapter architecture surfaces, and selected script sources.
- Detailed map: `scripts/verify/codemap.md`.
- Runtime dependencies are Bun process/file APIs plus Node filesystem, path, URL, and child-process utilities.
