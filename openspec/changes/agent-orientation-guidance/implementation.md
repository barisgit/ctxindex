## Capability Implementation Targets

- `cli-surface` → `openspec/specs/cli-surface/implementation.md`
- `search-routing` → `openspec/specs/search-routing/implementation.md`

## Module Ownership

No new durable module ownership or dependency direction is introduced. Bundled Markdown remains owned by `skills/`; the existing CLI skills loader, manifest macro, command parser, formatter, and embedded packaging path continue to serve it unchanged.

## Interfaces and Data Flow

The public `skills list/get/path` interface and the existing `--json` and `--inline` parsing and formatting flow remain stable. Removing one referenced Markdown asset changes only manifest input: the manifest continues to discover top-level skill files, `get` resolves the same `getting-started` name, and inlining traverses zero references for that document.

## Storage and State

Not applicable. Skills are release-bundled assets; no persistent user state or schema changes.

## Security and Compatibility

No provider egress, credentials, or live provider calls are involved. The compiled executable must continue embedding the remaining skill so relocation does not depend on repository files. The release is pre-alpha, but the accepted issue explicitly preserves the skills command surface and supported output options.

## Verification

Focused repository-content tests enforce the orientation boundary and required live discovery routes. Skills CLI and sandbox e2e tests prove list/get/path, JSON, and inline behavior from source. The compiled-skills e2e test proves the same standalone orientation is embedded in a relocated executable. Repository CI and strict OpenSpec validation remain the cross-cutting gates.

## Promotion Notes

- `openspec/specs/cli-surface/implementation.md`: No promotion required; the change introduces no new stable TypeScript interface, module seam, state owner, or data flow.
- `openspec/specs/search-routing/implementation.md`: No promotion required; search implementation and runtime behavior are unchanged, and only duplicated bundled prose is removed.
