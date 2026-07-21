## ADDED Requirements

### Requirement: Daemon documentation projection is bounded portable data

When the daemon owns the loaded Extension registry, it SHALL expose Extension documentation list, exact-get, and bounded-search operations over its immutable passive projection through the typed local RPC contract. Inventory and search responses MUST NOT include document or asset content. Exact Markdown and metadata retrieval MUST return bounded UTF-8 text; exact asset retrieval MUST return bounded canonical Base64 whose decoded byte count matches the declared size and verified media type.

Every request and response MUST use strict bounded schemas. Invalid or oversized application output MUST fail as `result_too_large` rather than being truncated. The wire contract MUST NOT expose source filesystem paths, managed materialization paths, module or file URLs, deferred readers, callbacks, executable definitions, schemas, or provider state.

#### Scenario: Agent lists daemon-owned documentation

- **WHEN** a selected daemon lists its loaded Extension documentation
- **THEN** it returns only strict safe metadata rows and transfers no Markdown, generated metadata content, or image bytes

#### Scenario: Agent retrieves an image asset

- **WHEN** a selected daemon retrieves one exact verified Extension image asset
- **THEN** it returns canonical bounded Base64 with matching decoded size and no source location

#### Scenario: Application output exceeds protocol bounds

- **WHEN** the daemon's passive projection cannot fit the declared item, row-count, text, binary, or search-result bounds
- **THEN** the request fails with `result_too_large` and returns no partial projection
