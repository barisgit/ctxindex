# Agent guide for ctxindex

## Documentation ownership — never duplicate truth

- `CONTEXT.md` owns ubiquitous language and domain relationships; terminology resolves there first.
- `openspec/specs/<capability>/spec.md` owns normative behavior and contracts.
- Adjacent `implementation.md` sidecars own selective interface-first doctrine; behavior remains in `spec.md`.
- `SYSTEM.md` is a non-normative readable projection; refresh it via the `system-reference` skill.
- `docs/milestones/V1.md` and `V1_1.md` are completed historical records, not current scope.
- `docs/design/2026-07-13-context-access-layer.md` owns accepted decisions D1–D22 and cross-cutting rationale.
- `openspec/` owns spec-driven changes; use `openspec list` for active inventory and `openspec/config.yaml` for artifact order.
- `.agents/skills/repo-development/SKILL.md` owns the triggered development and CLI walkthrough.

## Always-true working rules

- Work from GitHub issues and follow `CONTRIBUTING.md` for branch, OpenSpec, verification, and pull-request workflow.
- Non-trivial behavior changes require an OpenSpec change; trivial fixes do not.
- Bug fixes start with a failing reproduction test; new behavior lands with focused tests before or with implementation.
- Pass each focused task and Slice gate before continuing. The final gates are `bun run ci` and `bunx openspec validate --all --strict`; run `openspec-verify-change` before archive.
- At Human checkpoints, prepare isolated state and pause for consent or UI verification without requesting secrets.
- The repository is pre-alpha: do not add schema migrations, CLI compatibility, or deprecated aliases before a release creates that obligation.
- The CLI is the only agent integration surface: external agents (Codex CLI, OpenClaw/Hermes, Claude Code) consume ctxindex by composing commands with `--json`; do not add an MCP server or per-agent integration layers.
- Every Source belongs to one user-created Realm; there is no `global` Realm, and explicit Realm filters are exact.
- Provider mutations stop at reversible email Draft create/update. Never send email or add other provider mutations.
- Exit codes are stable API; see `openspec/specs/error-taxonomy/spec.md`.
- Bun is pinned to 1.3.14; keep `apps/cli/src/e2e/compiled-extension.e2e.test.ts` green.
- Never commit secrets or `.env` files. Do not delete user data under `~/.local/share/ctxindex` without consent.
- Do not push directly to `main` unless explicitly asked.
- After non-trivial structural changes, refresh affected `codemap.md` files via the `cartography` skill.
