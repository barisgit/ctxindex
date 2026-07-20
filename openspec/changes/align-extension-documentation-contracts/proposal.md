## Why

The accepted cross-cutting design and two canonical capability requirements still describe the pre-redesign Extension authoring and documentation model. They now conflict with the implemented runtime SDK imports, closed OAuth2-or-none Provider contract, passive Extension documentation projection, and deferred presentation consumers. Several current system and codemap statements also misname package publication boundaries or registry/Profile integration paths. These contradictions make the repository's source-of-truth hierarchy unreliable even though runtime behavior is already correct.

## What Changes

- Align decisions D2, D3, D5, and D19 and their supporting Extension SDK narrative with ordinary runtime imports from the private SDK workspace, host-provided operation contexts, the current `oauth2 | none` auth surface, supported Extension roots, and implemented passive documentation sidecars.
- Clarify that the passive transport-neutral documentation projection exists while CLI, web, and agent presentation consumers remain deferred.
- Replace the stale active V1 OpenSpec path with its archived evidence path and direct current work to `openspec list`.
- Correct canonical core-model and CLI-surface requirements that still call the documentation-sidecar contract future work.
- Correct current SYSTEM and codemap package names, registry traversal language, publication boundaries, and Profile path-predicate integration.
- No runtime, schema, CLI, packaging, provider, or persisted-state behavior changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `core-model`: Recognize passive Extension documentation as a separate implemented sidecar contract rather than future work.
- `cli-surface`: Preserve schema-derived agent interfaces while distinguishing bundled workflow skills from implemented passive Extension documentation whose presentation consumers remain deferred.

## Impact

Documentation-only changes affect the accepted design record, `SYSTEM.md`, canonical `core-model` and `cli-surface` contracts and implementation doctrine, and focused registry/SDK/Profile codemaps. Runtime source, package manifests, release automation, the active `ship-installable-npm-cli` change, and archived OpenSpec changes remain untouched.
