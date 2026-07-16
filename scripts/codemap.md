# scripts/

## Responsibility

Provides repository-level executable tooling: policy verification gates under `scripts/verify/`, isolated implementation proofs under `scripts/spikes/`, and the bounded process runner `scripts/with-timeout.ts`.

## Design/patterns

- Verification scripts are deterministic command-line gates: they scan production source/config, optionally spawn or import runtime targets, print findings, and signal success or failure by exit status. Explicit `.red.ts` contracts record unmet milestone architecture before their assertions graduate into the normal suite. See `scripts/verify/codemap.md`.
- Spike scripts isolate uncertain integration behavior from product packages. See `scripts/spikes/codemap.md`.
- `with-timeout.ts` is a process-supervisor wrapper. It runs a command in a detached process group where supported, forwards terminal streams/signals, and applies TERM-then-KILL timeout escalation.

## Data & control flow

1. Package scripts or operators invoke a verifier, spike host, or `bun scripts/with-timeout.ts <timeoutSecs> [--] <cmd> [args...]`.
2. Verifiers inspect discovered production paths, workspace imports/manifests, and package exports, then return contract-specific status output and exit codes.
3. Spikes execute bounded host/fixture interactions and expose results through stdout/process status.
4. `with-timeout.ts` parses the CLI timeout, optionally overrides it from `TEST_WALL_TIMEOUT_SECS`, spawns the child, and normally propagates its exit code. On timeout it signals the process group with `SIGTERM`, waits up to `KILL_GRACE_MS`, escalates to `SIGKILL`, and exits `124`; incoming `SIGINT`/`SIGTERM` are forwarded with exits `130`/`143`.

## Integration points

- Root `package.json` exposes `with-timeout` and uses it to bound `test:e2e`; `ci` delegates to the verification toolchain.
- Verification targets include every `apps/*` and `packages/*` workspace, their manifests, CLI/core/Adapter architecture surfaces, and selected script sources.
- Detailed maps: `scripts/verify/codemap.md`, `scripts/spikes/codemap.md`, and `scripts/spikes/d3-compiled-extension/codemap.md`.
- Runtime dependencies are Bun process/file APIs plus Node filesystem, path, URL, and child-process utilities.
