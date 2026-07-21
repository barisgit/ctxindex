## MODIFIED Requirements

### Requirement: Extension documentation is an owned sidecar concern
`@ctxindex/extension-sdk` SHALL expose one core-independent, side-effect-free `docs()` helper and plain directory-or-virtual declaration types. Only an Extension root MAY carry the declaration; Provider, OAuth App, Profile, and Adapter values MUST remain free of embedded documentation. Provider-neutral core SHALL bind acquired entry-module provenance, validate and normalize the sidecar before atomic activation, and expose transport-neutral documentation data. Extension documentation MUST NOT affect definition identity, equivalence, dependency resolution, acquisition, or operation behavior.

#### Scenario: Documentation remains outside definition behavior
- **WHEN** an Extension declares a documentation sidecar
- **THEN** its imported Provider, OAuth App, Profile, and Adapter values retain their existing shapes and activation semantics

#### Scenario: No consumer-specific runtime enters the SDK
- **WHEN** the public SDK and package dependencies are inspected
- **THEN** documentation authoring adds no filesystem, Catalog, CLI, browser, Markdown-rendering, or network dependency to `@ctxindex/extension-sdk`
