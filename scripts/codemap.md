# scripts/

## Responsibility

Provides repository-level executable tooling: policy verification gates under `scripts/verify/`, npm artifact and release gating under `scripts/release/`, bounded process supervision in `scripts/with-timeout.ts`, and helper-created worktree isolation through `scripts/worktree-new.sh` and `scripts/cli.sh`.

## Design/patterns

- Verification scripts are deterministic command-line gates: they scan production source/config, optionally spawn or import runtime targets, print findings, and signal success or failure by exit status. Turbo owns orchestration through package tasks and narrowly scoped root `//#...` tasks; repository contract tests live under `tests/tooling/`, outside executable tooling. See `scripts/verify/codemap.md`.
- Release scripts build, stage, and inspect a minimal CLI package, smoke the exact archive in isolated global/state directories, and fail closed on invalid, unbumped, reversed, already raced, or indeterminate npm versions. See `scripts/release/codemap.md`.

- `with-timeout.ts` is a process-supervisor wrapper. It runs a command in a detached process group where supported, forwards terminal streams/signals, and applies TERM-then-KILL timeout escalation.

- Worktree isolation uses an ignored `.ctxindex/worktree` marker. The shared CLI launcher detects that marker and overrides both `CTXINDEX_*_HOME` and `XDG_*_HOME` to worktree-local config, data, state, and cache directories; without it, caller-provided paths are preserved.

## Data & control flow

1. Package scripts or operators invoke a verifier; E2E package tasks invoke `bun scripts/with-timeout.ts <timeoutSecs> [--] <cmd> [args...]` directly.
2. Verifiers inspect discovered production paths, root-declared workspace imports/manifests, and package exports, then return contract-specific status output and exit codes.
3. `with-timeout.ts` parses the CLI timeout, optionally overrides it from `TEST_WALL_TIMEOUT_SECS`, spawns the child, and normally propagates its exit code. On timeout it signals the process group with `SIGTERM`, waits up to `KILL_GRACE_MS`, escalates to `SIGKILL`, and exits `124`; incoming `SIGINT`/`SIGTERM` are forwarded with exits `130`/`143`.
4. `scripts/worktree-new.sh` accepts only `feature`, `fix`, `docs`, or `chore` branches, preflights existing refs for marker-aware root and package-local CLI wiring before attach, and creates the isolated directories and marker. Supported `bun cli` / `bun run cli` invocations then use `scripts/cli.sh`, which launches `apps/cli/bin/ctxindex.mjs` with isolated paths.

## Integration points

- Root and `apps/cli/package.json` expose `cli` through `scripts/cli.sh`; the root manifest is the single developer command surface for the Turbo-native CI graph and root verifier/test tasks.
- Verification targets include every root-declared `apps/*` and `packages/*` workspace, their manifests, CLI/core/Adapter architecture surfaces, and selected script sources.
- Detailed map: `scripts/verify/codemap.md`.
- Package and release tooling map: `scripts/release/codemap.md`.
- Runtime dependencies are Bun process/file APIs plus Node filesystem, path, URL, and child-process utilities.
