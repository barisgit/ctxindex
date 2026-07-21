## MODIFIED Requirements

### Requirement: Atomic per-Extension install and update lifecycle
One generic installation record SHALL be owned by one stable Extension id and SHALL retain the exact direct or Catalog curation provenance required for later explicit update. Install MUST reject an id owned by a different direct target, configured Catalog identity, builtin, or explicit path and MUST direct the caller to uninstall. A same-Catalog install MAY replace only the same configured Catalog name and Catalog id under the existing replacement rules.

Update MUST use the selected record's stored provenance. Direct update SHALL use its stored source kind and requested target. Catalog-curated update SHALL refresh only its recorded configured Catalog, select the same stable Extension id from the refreshed exact snapshot, and preserve the configured Catalog name and Catalog id. Update MUST resolve or replay a fresh candidate only during the explicit request and atomically replace the old record and materialization only after the replacement complete candidate validates. A same-resolution or same-content update MAY succeed as an idempotent no-op. Update MUST NOT change origin, target, Catalog identity, or stable Extension id.

Lifecycle mutations MUST be serialized. A failed acquisition, refresh, import, validation, conflict check, materialization publication, or record write MUST preserve the prior record and runnable materialization unchanged. Independently installed sibling roots MUST remain independently updateable and uninstallable even when their materialized bytes are internally deduplicated.

#### Scenario: Invalid direct update preserves old code
- **WHEN** direct update resolves a candidate that cannot be acquired, imported, selected, or validated
- **THEN** the prior exact installation remains active and its record and materialization are unchanged

#### Scenario: Catalog-curated update advances the same curation
- **WHEN** update selects a Catalog-curated record and its recorded configured Catalog now contains a newer valid exact entry for the same stable id
- **THEN** only that Catalog refreshes and the record advances atomically while retaining its curation identity

#### Scenario: Catalog-curated update cannot refresh
- **WHEN** the recorded Catalog is absent, cannot refresh, or no longer contains the exact stable id
- **THEN** update fails without changing the installed record or runnable bytes

#### Scenario: Existing id is installed from another origin
- **WHEN** install selects an Extension id already owned by a different allowed origin
- **THEN** install fails without replacement and reports the explicit uninstall-first workflow
