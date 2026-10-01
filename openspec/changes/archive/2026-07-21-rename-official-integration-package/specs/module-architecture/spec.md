## MODIFIED Requirements

### Requirement: Implementation follows explicit module ownership
The repository MUST organize behavior by its domain owner, keep composition roots free of provider-specific implementations, use package manifests/imports for dependencies, and use one Extension activation boundary for every origin. The `@ctxindex/official` package MUST distribute official Provider, OAuth App, Source Adapter, transport, documentation-tree, and Extension-root implementations, while generic Adapter authoring contracts remain owned by `@ctxindex/extension-sdk`.

#### Scenario: Built-in integration locality
- **WHEN** a maintainer inspects a built-in integration
- **THEN** Provider auth/App-schema declarations are Provider-owned, Adapter behavior is Adapter-owned, vocabulary is Profile-owned, package dependencies are manifest-owned, and the Extension root only composes imported values
- **THEN** official implementations are distributed from `@ctxindex/official` without moving generic Adapter contracts out of `@ctxindex/extension-sdk`

#### Scenario: Providerless Adapter locality
- **WHEN** a maintainer inspects a providerless local Adapter
- **THEN** its module owns local config and operations without importing or synthesizing Provider, Account, Grant, auth, Provider egress, or Provider access concepts
