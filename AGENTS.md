# Agent guide for ctxindex

## Documentation ownership — never duplicate truth

- `CONTEXT.md` — ubiquitous language and domain relationships. Terminology resolves here first.
- `SPEC.md` — timeless normative behavior, contracts, and stable exit codes.
- `V1.md` — first-release scope, deferrals, slices, and exit criteria.
- `IMPLEMENTATION.md` — intended reference code/package/storage choices.
- `docs/design/2026-07-13-context-access-layer.md` — accepted decisions D1–D22 and cross-cutting rationale.
- `openspec/` — spec-driven change management. Use `openspec list` for the authoritative active-change inventory; multiple completed changes may intentionally remain active pending an explicit archive request. Capability specs reference `SPEC.md` sections rather than duplicating them.
- `docs/CURRENT-STATE.md`, `docs/OPEN-QUESTIONS.md`, `docs/reference-study*.md`, and `docs/release/` — archived prototype material; internal `v1` labels do not describe the current V1 product scope.

## Working rules

- The repository is pre-alpha. Prototype code and local databases are disposable; do not add schema migration, CLI compatibility, or deprecated aliases unless a later released version creates that obligation.
- Non-trivial behavior changes go through an OpenSpec change (`openspec new change`, then proposal → specs → design → tasks). Trivial fixes do not.
- Apply OpenSpec tasks in dependency order. A task is complete only after its focused checks pass; every `tasks.md` Slice gate is mandatory before the next slice. At a Human checkpoint, prepare isolated state and pause for user login/consent/UI verification without requesting secrets; resume and continue after explicit confirmation. Continue end to end until a real blocker, then run the final project gate and `openspec-verify-change` before archive.
- Make the smallest independently verifiable slice listed in the active milestone (`V1.md`, then `V1_1.md`); do not implement later slices speculatively.
- Profiles define domain semantics and typed Actions; Adapters perform provider I/O; Extensions only bundle definitions.
- Every Source belongs to one user-created Realm. There is no special `global` Realm and explicit realm filters are exact.
- V1 provider mutations stop at reversible email Draft create/update. Sending and other provider Actions are deferred.
- The CLI is invoked only via `bun cli` / `bun run cli`; there is no `bun link`. `docs/AGENT-HOWTOS.md` describes the current prototype harness.
- Bun is pinned to 1.3.14. Keep `scripts/spikes/d3-compiled-extension/run.sh` green.
- Exit codes are stable API; see `SPEC.md` §12.
