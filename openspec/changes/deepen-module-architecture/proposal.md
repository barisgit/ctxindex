## Why

ctxindex reached V1 through vertical slices, but implementation locality did not keep pace: Gmail Adapter code is split between the package root and a mostly dead provider directory, composition roots own provider schemas, several deep interfaces are trapped in monolithic files, and stale prototype paths and dependencies remain. This makes ownership unclear, hides dead code, and raises the cost and risk of adding the next Profile or Adapter.

## What Changes

- Co-locate each built-in Source Adapter's definition, configuration, operations, provider helpers, and tests under one Adapter-owned module; reduce the built-in Extension file to composition only.
- Delete dead Gmail/provider and prototype sync implementations, remove speculative support for forbidden Adapter-owned tables, and prune unused runtime dependencies.
- Split the public Extension SDK, registry presentation, logger internals, and oversized CLI command handlers into deeper modules with smaller interfaces and clear seams.
- Consolidate duplicated file-path invariants and move tests to the package or module that owns the behavior.
- Make CLI thin-command enforcement complete rather than relying on a hand-maintained file allowlist.
- Normalize package entrypoints and update implementation guidance, codemaps, and architecture checks so the intended locality is durable.
- Preserve V1 CLI behavior, public Extension authoring contracts and package subpath names, storage schema, provider request behavior, and stable exit codes; unreachable symbols in private workspace packages may be removed.

## Capabilities

### New Capabilities

- `module-architecture`: Repository-level ownership, locality, package-direction, and public-seam invariants that keep implementation modules deep and prevent dead prototype paths from returning.

### Modified Capabilities

None. Existing normative requirements remain unchanged.

## Impact

The change affects internal source layout and tests in `packages/adapters`, `packages/core`, `packages/extension-sdk`, `packages/profiles`, `apps/cli`, package manifests/lockfiles, architecture verification scripts, `IMPLEMENTATION.md`, and hierarchical codemaps. Internal relative imports and unreachable private-workspace symbols may change; declared package subpath names and the public Extension SDK Interface remain stable. No database migration, compatibility alias, provider traffic, or new user workflow is introduced.
