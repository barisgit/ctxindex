## 1. Orientation contract

- [x] 1.1 Update focused repository, skills CLI, sandbox e2e, and compiled-skills tests first so they require standalone orientation, required live discovery routes, absence of static inventories/setup/schema prose, and preserved `list/get/path`, `--json`, and `--inline` behavior.
- [x] 1.2 Replace the bundled `getting-started` workflow guide with concise orientation, remove `skills/reference/cli-overview.md`, and update `skills/README.md` to identify live discovery as authoritative.
- [x] 1.3 Run the focused repository, skills CLI, sandbox e2e, registry-interface, and compiled-skills verification.

## 2. Doctrine and final verification

- [x] 2.1 Confirm that no implementation doctrine needs promotion into the canonical CLI-surface or search-routing sidecars because runtime interfaces and search behavior are unchanged.
- [x] 2.2 Run `bun run ci`, `bunx openspec validate --all --strict`, and the OpenSpec verification workflow for `agent-orientation-guidance`.
