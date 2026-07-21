## MODIFIED Requirements

### Requirement: External Extension proves the public seam
For V1, the repository SHALL provide one official external tenders Extension that loads outside the compiled binary and exercises the same public Profile, Adapter, and Extension contracts as bundled definitions. The Extension MUST be providerless, require no Account, credential, provider egress, or prepared input data, and emit a deterministic synthetic corpus large and varied enough to demonstrate Sync, full-text search, typed field filtering, and complete Resource retrieval through generic operations.

The separately publishable demo package SHALL expose this exact Extension through the normal direct Extension installation contract without requiring a separately published SDK package. Authored documentation MUST identify the data as synthetic, providerless, and generated without network access or scraping, and provide one copy-paste workflow using isolated state. Website-ready expected output MAY replace generated ids, timestamps, integrity values, and digests with explicit placeholders but MUST otherwise preserve the actual CLI document shape and representative semantic values.

#### Scenario: Fresh installation runs the official instant demo
- **WHEN** an operator with a compiled globally installed CLI installs the official demo package, selects the official demo Extension, creates a Realm and Source, and runs Sync
- **THEN** useful complete synthetic tender Resources become locally searchable without authentication, provider network access, filesystem fixture preparation, or secrets

#### Scenario: Demo exercises generic discovery and retrieval
- **WHEN** the operator searches the synced demo by text and typed fields and follows a returned Ref with `get`
- **THEN** the CLI serves matching Resources and the complete selected payload through generic ctxindex operations without bundled-only or demo-only hooks

#### Scenario: Demo provenance is unambiguous
- **WHEN** an operator reads the package or Extension documentation
- **THEN** the records are identified as deterministic synthetic fixtures and are not represented as current data from a real procurement provider
