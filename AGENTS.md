# Agent guide for ctxindex

## Documentation ownership — never duplicate truth

- `CONTEXT.md` — domain language and naming rules. Terminology questions resolve here first.
- `SPEC.md` — external normative spec (behavior, contracts, exit codes). Requirement-level truth.
- `IMPLEMENTATION.md` — reference implementation choices. Its banner maps superseded sections to their replacements; trust the banner over the body.
- `V1.md` — historical v1 milestone scope (items/chunks language; superseded by the access-layer redesign).
- `docs/design/2026-07-13-context-access-layer.md` — the access-layer redesign: decisions D1–D19, concept model, six-table storage, open questions (§13).
- `openspec/` — spec-driven change management (OpenSpec CLI). Active change: `v2-context-access-layer`. Capability specs under `openspec/specs/` are written per implementation slice and must reference `SPEC.md` sections, not duplicate them.
- `docs/CURRENT-STATE.md`, `docs/OPEN-QUESTIONS.md` — historical v1 build logs; read the top banners before trusting details.

## Working rules

- Non-trivial behavior changes go through an OpenSpec change (`openspec new change`, then proposal → specs → design → tasks). Trivial fixes do not.
- The CLI is invoked only via `bun cli` / `bun run cli`; there is no `bun link`. See `docs/AGENT-HOWTOS.md` for sandboxed-XDG and gmail-mock e2e recipes.
- Gates before the v2 storage migration: the D3 spike (compiled Bun binary dynamically importing an external `.ts` extension) and the realms keep/cut verdict.
- Exit codes are stable API (`needs_auth=10`, etc.); see `SPEC.md` §12.
