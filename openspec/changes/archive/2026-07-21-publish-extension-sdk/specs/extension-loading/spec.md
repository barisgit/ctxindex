## MODIFIED Requirements

### Requirement: Compiled binary resolves ordinary package dependencies
The relocated Bun compiled-binary gate SHALL load a trusted external package whose `ctxindex.extensions` entry uses ordinary imports from the packed public `@ctxindex/extension-sdk` artifact, SDK-exported `z`, a relative TypeScript module, and a package-managed runtime dependency. The gate MUST run outside the repository under Bun 1.3.14 and prove common exported-value discovery without workspace links, host injection, or ctxindex dependency resolution.

#### Scenario: Relocated binary loads materialized package
- **WHEN** the compiled gate activates a clean external package installed against the exact packed SDK artifact
- **THEN** its exported graph loads through the same collection and activation path as built-ins without resolving the source workspace
