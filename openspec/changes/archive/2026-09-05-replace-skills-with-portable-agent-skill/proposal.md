## Why

ctxindex now has a deterministic offline documentation surface, while the older generic bundled-skills subsystem serves only one short orientation document through overlapping list/get/path commands. Agents instead need one portable standard `SKILL.md` whose exact release-matched bytes can be retrieved without introducing a second documentation inventory.

## What Changes

- Add one canonical `skills/ctxindex/SKILL.md` with standard `name` and `description` frontmatter, concise live-discovery guidance, and one programmatic Bash composition example.
- Add `ctxindex docs get-skill` to print or explicitly copy the exact bundled skill bytes.
- Embed the skill in the compiled CLI so retrieval remains offline and relocation-safe.
- **Breaking:** remove `ctxindex skills list|get|path`, the old `skills/getting-started.md`, and their generic bundled-skills runtime surface without compatibility aliases.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cli-surface`: Replace the generic bundled-skills command group with one release-bundled portable ctxindex Agent Skill.
- `documentation-consumption`: Add exact offline retrieval of the portable skill through the docs command group.
- `search-routing`: Retire obsolete requirements that duplicated enumeration and pagination guidance in bundled skill files.

## Impact

The change affects CLI command definitions and generated help/reference, compiled package embedding, the repository `skills/` source tree, docs command tests, no-prompt contracts, package smoke/e2e tests, and the two capability specifications above. It adds no provider access, persistent state, schema, network dependency, or Extension mutation restriction.
