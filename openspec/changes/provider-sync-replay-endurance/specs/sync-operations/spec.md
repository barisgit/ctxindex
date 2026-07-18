## ADDED Requirements

### Requirement: Calendar sync contracts have deterministic repeated-run replay evidence
Automated acceptance evidence SHALL apply one shared persisted sync lifecycle to Google Calendar and the default Microsoft Calendar using only invented provider-shaped fixtures and loopback provider mocks. The lifecycle SHALL cover a multi-page initial sync, unchanged incremental sync, one add/update/delete transition, a repeated unchanged transition, provider-declared cursor invalidation with bounded full reconciliation, and a final unchanged incremental sync. Every phase SHALL execute in a fresh CLI process against one provider-local isolated state directory.

The evidence SHALL verify committed cursor use and advancement without interpreting provider cursor contents; stable Refs and unchanged normalized materialization; exact add/update/delete counters; exactly one tombstone without duplication; the provider's stable invalidation warning; at most one full recovery reconciliation; and no additional change after recovery. Provider-specific replay code SHALL be limited to mock setup, provider-state transition, cursor expiry, and inspection of expected redacted read routes.

#### Scenario: Both calendar providers complete the shared replay
- **WHEN** the automated replay runs the shared lifecycle for Google Calendar and the default Microsoft Calendar
- **THEN** each provider satisfies the same persisted Resource, Ref, Sync Run, cursor, tombstone, warning, and unchanged-replay assertions without live authentication or provider data

#### Scenario: Recovery remains bounded and non-destructive
- **WHEN** either loopback provider rejects the replay's committed cursor using its declared invalidation response
- **THEN** exactly one bounded full reconciliation replaces the cursor, preserves the visible Resource and tombstone snapshot, and is followed by an unchanged incremental run
