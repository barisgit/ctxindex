# ctxindex

ctxindex is a local personal-context gateway for agents. It provides one deterministic interface to discover, retrieve, and materialize context across mail, files, calendars, tasks, and extension-defined domains, then perform typed provider Actions through the same configured Source and authentication. Indexing is a strategy for fast local discovery, not the product boundary.

```text
Agent ───── CLI ────> ctxindex ──> Sources ──> providers/files
                         │
                         ├── Realms: personal / company / university
                         ├── Profiles: portable domain semantics
                         ├── Adapters: provider operations
                         └── Resources / Refs / Relations / Artifacts
```

## Agent integration

The CLI is the integration surface: any code-executing agent can use ctxindex
with zero integration work. Codex CLI, OpenClaw, Claude Code, and similar
agents compose `search`, `get`, `thread`, `export`, and `action` directly from
a shell, including from Hermes-driven OpenClaw sessions. There is no MCP
server and none is required; deterministic commands, `--json` output, and
stable exit codes are the contract. ctxindex was originally built to give a
personal OpenClaw agent governed, realm-scoped access to mail and calendar
across multiple accounts.

V1 and V1.1 are shipped. The project remains pre-alpha but functional: it provides multi-provider mail and calendar workflows through `search`, `sync`, `get`, `thread`, and `export`, plus reversible Draft actions. The implementation receives no schema or CLI compatibility treatment until a released version creates that obligation. Current behavior is owned by the capability specs under `openspec/specs/`; use `openspec list` for the authoritative active-change inventory.

## Development

```sh
bun install
bun cli --help
# equivalently:
bun run cli --help
```

There is no `bun link` development path. The root and package-local scripts both
dispatch through `scripts/cli.sh` to `apps/cli/bin/ctxindex.mjs` so
helper-created worktrees use isolated state.

## Packaging

The release shape is one executable compiled with the repository-pinned Bun
version. Bundled workflow skills and canonical migrations are embedded;
trusted external Extensions remain explicit files loaded from configured paths.
Relocation of the compiled executable, bundled skills, and external Extension
loading are repository gate scenarios rather than alternate installation
paths.

## Documentation map

| Document | Owns |
|---|---|
| `CONTRIBUTING.md` | Issue taxonomy and branch, OpenSpec, verification, and pull-request workflow |
| `BACKLOG.md` | Non-normative candidate roadmap and promotion into issues and OpenSpec changes |
| `CONTEXT.md` | Ubiquitous language and domain relationships |
| `SYSTEM.md` | Non-normative, agent-synthesized readable system projection |
| `openspec/specs/` | Canonical normative capability behavior and selective non-normative interface-first implementation doctrine |
| `docs/milestones/` | Completed V1 and V1.1 historical milestone records |
| `docs/design/2026-07-13-context-access-layer.md` | Decisions D1–D22 and cross-cutting rationale |

| `openspec/changes/` | Active and archived change proposals, artifacts, and tasks |
| `.agents/skills/repo-development/SKILL.md` | Triggered repository development and CLI walkthrough |
| `skills/` | Agent-facing usage docs shipped with the CLI |
