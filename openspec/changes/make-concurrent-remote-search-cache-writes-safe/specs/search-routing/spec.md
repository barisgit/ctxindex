## ADDED Requirements

### Requirement: Remote-search cache contention degradation
Core SHALL materialize the verified Resources from each remote origin as one atomic optional cache batch. If cache materialization exhausts the bounded storage contention wait, search MUST preserve all verified provider Resources, MUST append one per-origin warning with code `storage_busy`, and MUST complete successfully when no other terminal failure occurs. Search MUST NOT expose raw SQLite busy or lock details. Cancellation MUST retain the existing cancelled outcome rather than being converted to cache degradation.

#### Scenario: Optional cache contention preserves provider results
- **WHEN** a remote origin returns verified Resources but its cache batch exhausts the storage contention bound
- **THEN** search returns the complete provider result set with one actionable `storage_busy` warning and exits 0

#### Scenario: Concurrent overlapping origins remain complete
- **WHEN** separate search processes receive overlapping provider result sets and their cache batches contend within the supported bound
- **THEN** each search returns its complete provider results and the cache contains deduplicated Resources with complete projections

#### Scenario: Cancellation wins over cache degradation
- **WHEN** remote search is cancelled before cache materialization or cancellation is observed when a contended write returns
- **THEN** search reports the existing cancelled outcome without a `storage_busy` warning
