## Why

The public CLI has accumulated two definitions of every command: Citty metadata renders help while separate raw-argument parsers validate and interpret behavior. Those definitions now disagree about required arguments, flag spelling, enum values, nested command paths, and Extension installation grammar. The handwritten web CLI reference has drifted for the same reason. At the same time, ctxindex already carries bundled workflow skills and a validated Extension documentation projection, but agents cannot deterministically discover comprehensive authored documentation offline.

The project is still pre-alpha, so this is the right point to simplify the command contract before a release creates compatibility obligations. The result must remain non-interactive, agent-safe, schema-derived, and small enough to understand from `ctxindex --help` alone.

## What Changes

- Make one declarative Citty command tree authoritative for argument parsing, validation, help, tests, and generated CLI reference data. Generic validation preserves stable invalid-usage behavior without per-command parsers.
- Correct root and nested help so it shows complete command paths, kebab-case flags, required values, enum choices, defaults, trust boundaries, and only root-relevant guidance.
- **BREAKING** Rename the public `extensions` group to singular `extension` and replace the overloaded install grammar with `extension install <catalog|npm|git|local> <target> <extension-id>`.
- **BREAKING** Move Catalog discovery to `extension catalog search`, make `extension update <id>` follow either direct or Catalog provenance, collapse `thread get <ref>` to `thread <ref>`, move Artifact-cache removal to `artifact purge`, and remove the duplicate `action describe` route in favor of source-aware `describe action <id>`.
- Add deterministic offline `docs list`, `docs get`, and `docs search` commands over bundled product documentation and loaded Extension documentation. Authored documents remain distinct from generated definition reference.
- Generate the web CLI reference from the authoritative command tree instead of maintaining command tables by hand.
- Remove the superseded parser modules, compatibility routes, and duplicated usage strings. No deprecated aliases are retained before the first release.

## Capabilities

### New Capabilities

- `documentation-consumption`: deterministic bundled and Extension documentation inventory, retrieval, search, packaging, and safe output behavior.

### Modified Capabilities

- `cli-surface`: authoritative declarative command modeling, corrected help behavior, simplified public command grammar, and generated reference ownership.
- `extension-installation`: uniform explicit source-kind installation and provenance-aware update behavior for direct and Catalog-curated installations.
- `extension-documentation`: expose the existing transport-neutral projection through the accepted CLI documentation consumer without weakening passive-content or browser-safety boundaries.

## Impact

The change primarily affects `@ctxindex/cli`, the CLI package build, and `apps/web` reference generation. `@ctxindex/core` gains provider-neutral documentation query composition and Catalog-curated update delegation where existing services do not already expose it. The bundled package carries generated product-documentation artifacts in addition to skills. Tests, bundled guidance, web docs, `SYSTEM.md`, and affected codemaps must be refreshed together.

No database migration, provider-specific command, network-backed documentation lookup, new mutation boundary, or MCP surface is introduced. Documentation stays passive and bounded; JSON output cannot expose source filesystem paths or managed materialization paths.
