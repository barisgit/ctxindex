## ADDED Requirements

### Requirement: Bounded concurrent Resource materialization
Resource batch materialization SHALL coordinate writers across processes through the shared SQLite database, SHALL wait no longer than the configured five-second busy bound to acquire a write reservation, and SHALL atomically commit or roll back every Resource and its derived fields, chunks, and Relations in the batch. Repeated Refs in one batch MUST produce one stored Resource identity and one complete set of projections.

#### Scenario: Concurrent batches materialize completely
- **WHEN** separate ctxindex processes materialize overlapping Resource batches against one database within the supported contention bound
- **THEN** every batch commits without exposing a SQLite busy error, overlapping Refs remain deduplicated, and no Resource is observable with partial projections

#### Scenario: Batch projection failure rolls back all Resources
- **WHEN** deriving or storing one Resource projection fails within a batch
- **THEN** no Resource or derived projection from that batch is committed

#### Scenario: Write contention exhausts the bound
- **WHEN** another writer prevents a Resource batch from acquiring its reservation for the full configured bound
- **THEN** storage fails with an actionable normalized `storage_busy` error and does not expose raw SQLite busy or lock text
