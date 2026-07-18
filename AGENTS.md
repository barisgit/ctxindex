# Agent guide for ctxindex

## Documentation ownership — never duplicate truth

- `CONTEXT.md` — canonical ubiquitous language and domain relationships. Terminology resolves here first.
- `openspec/specs/<capability>/spec.md` — canonical normative behavior and contracts, split across 18 capabilities.
- `openspec/specs/<capability>/implementation.md` — selective, interface-first implementation doctrine; behavior remains owned by the adjacent `spec.md`.
- `SYSTEM.md` — non-normative, agent-synthesized readable projection; refresh it via the `system-reference` skill.
- `docs/milestones/V1.md` and `V1_1.md` — completed historical milestone records, not current scope.
- `CONTRIBUTING.md` — issue taxonomy and the branch, OpenSpec, verification, and pull-request workflow.
- `docs/design/2026-07-13-context-access-layer.md` — accepted decisions D1–D22 and cross-cutting rationale.
- `openspec/` — spec-driven change management. Use `openspec list` for the authoritative active-change inventory and let `openspec/config.yaml` determine artifact order. Completed changes may remain active until explicitly archived.
- `docs/release/` — archived prototype material; internal `v1` labels do not describe current product scope.

## Working rules

- Work from GitHub issues and follow `CONTRIBUTING.md`. Non-trivial behavior changes require an OpenSpec change; trivial fixes do not.
- Apply OpenSpec tasks in dependency order. Pass every focused task and Slice gate before continuing. At Human checkpoints, prepare isolated state and pause for consent/UI verification without requesting secrets.
- The final project gate is `bun run ci` plus `bunx openspec validate --all --strict`; then run `openspec-verify-change` before archive.
- Bug fixes start with a failing reproduction test. New behavior lands with focused tests before or with its implementation.
- Make the smallest independently verifiable change; do not implement speculative later work.
- The repository is pre-alpha. Do not add schema migrations, CLI compatibility, or deprecated aliases until a released version creates that obligation.
- Profiles define domain semantics and typed Actions; Adapters perform provider I/O; Extensions only bundle definitions.
- Every Source belongs to one user-created Realm. There is no special `global` Realm, and explicit realm filters are exact.
- Provider mutations stop at reversible email Draft create/update. Never send email or add other provider mutations.
- Invoke the CLI only via `bun cli` / `bun run cli`; there is no `bun link`. See `docs/AGENT-HOWTOS.md` for the prototype harness.
- Bun is pinned to 1.3.14. Keep `apps/cli/src/e2e/compiled-extension.e2e.test.ts` green.
- Exit codes are stable API; see `openspec/specs/error-taxonomy/spec.md`.
- Never commit secrets or `.env` files. Local databases under `~/.local/share/ctxindex` are user data; do not delete them without consent.
- Do not push directly to `main` unless explicitly asked.
- After non-trivial structural changes, refresh affected `codemap.md` files via the `cartography` skill.
