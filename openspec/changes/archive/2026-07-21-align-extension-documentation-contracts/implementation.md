## Capability Implementation Targets

- `core-model` → `openspec/specs/core-model/implementation.md`
- `cli-surface` → `openspec/specs/cli-surface/implementation.md`

## Module Ownership

`@ctxindex/extension-sdk` remains a private workspace package that defines runtime authoring factories and the pure Extension-root documentation declaration. Core owns resolution, bounded validation, identity stripping, and the passive authored/generated projection. Provider, Profile, Adapter, and OAuth App definitions do not own documentation fields.

The public unscoped `ctxindex` package owns CLI composition and bundled workflow skills. Loaded CLI definitions receive core's documentation projection as part of `LoadExtensionsResult`, but no current command or bundled skill renders, lists, or inlines that projection. A future presentation consumer requires its own accepted contract.

## Interfaces and Data Flow

Extension modules import runtime factory values and Zod from `@ctxindex/extension-sdk`. Host-provided operation contexts inject scoped effects such as authorized fetch, logging, secret access, Artifact output, and Resource lookup; no host factory callback exists.

An Extension may carry a directory descriptor or eager virtual documentation tree. Core resolves it against the already acquired module, validates bounded passive content, strips the declaration from the runtime definition, and builds a transport-neutral list/get projection beside the active registry. Registry collection includes exact explicitly listed roots plus Provider/Profile leaves reachable through already collected Adapters, Actions, and OAuth Apps; it performs no package dependency resolution or recursive module traversal.

Bundled skills remain a separate release-versioned workflow surface. Registry-derived descriptions remain authoritative for kinds, fields, formats, flags, and Actions.

## Storage and State

No new state. Documentation projections are derived from acquired Extension roots at load time. This change modifies documentation and contracts only.

## Security and Compatibility

Passive documentation remains non-executable and separate from definition identity, validation semantics, and runtime operations. The transport-neutral projection exposes neither host paths nor trusted HTML. Existing Extension trust, provider egress, package acquisition, CLI compatibility, and persisted-state behavior do not change.

## Verification

OpenSpec strict validation checks complete modified requirements and capability links. Focused documentation guards and repository CI check source-of-truth wording, package boundaries, and codemap consistency. Cartography confirms only tracked implementation hashes require atlas refresh. `openspec-verify-change` must find no critical or warning divergence before completion.

## Promotion Notes

- Merge the implemented passive Extension-root documentation boundary, separate projection, and no-definition-identity rule into `openspec/specs/core-model/implementation.md`.
- Merge the current no-consumer boundary between loaded Extension documentation and bundled CLI skills into `openspec/specs/cli-surface/implementation.md`.
