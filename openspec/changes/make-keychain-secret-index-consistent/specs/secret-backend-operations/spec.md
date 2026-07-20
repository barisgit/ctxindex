## ADDED Requirements

### Requirement: Keychain inventory mutations are process-consistent
Within one ctxindex process, Keychain-backed secret writes, deletes, and inventory reads MUST observe one serialized inventory mutation order across all backend instances. Every successful write MUST appear exactly once in inventory, every successful delete MUST be absent, and concurrent successful mutations MUST NOT overwrite one another.

A write whose inventory publication fails MUST fail before reporting or returning a usable new reference. If credential persistence fails after inventory publication, the operation MUST attempt to restore the prior inventory and MUST fail with the existing bounded backend error. A delete whose credential or inventory mutation fails MUST fail without being reported as complete. Failed compensation MAY leave a stale discoverable inventory entry but MUST NOT expose secret values or references in diagnostics.

The Keychain availability probe MUST use one stable reserved credential identity, MUST attempt deletion after every successful probe write even when the read fails, and MUST report read or cleanup failure as the existing bounded backend-unavailable error. A later probe MUST retry through the same identity rather than create another uniquely named probe credential.

#### Scenario: Concurrent writes preserve both entries
- **WHEN** two Keychain secrets are written concurrently through separate backend instances in one process
- **THEN** both successful references appear exactly once in deterministic inventory

#### Scenario: Inventory publication fails before credential write
- **WHEN** the reserved Keychain inventory cannot record a new entry
- **THEN** the write fails through the existing secret-backend error mapping and no untracked credential is reported as successful

#### Scenario: Credential write fails after inventory publication
- **WHEN** the credential value cannot be persisted after its intended inventory entry is published
- **THEN** ctxindex attempts to restore the previous inventory, reports the existing bounded backend failure, and reveals no secret material

#### Scenario: Probe read or cleanup fails
- **WHEN** the Keychain probe writes its reserved credential but reading or deleting it fails
- **THEN** ctxindex attempts cleanup, reports the bounded backend-unavailable error, and the next probe retries the same credential identity without accumulating probe rows

### Requirement: Authentication cleanup failures are explicit and redacted
Authentication lifecycle cleanup MUST count failures instead of silently discarding them. Cleanup failure before an operation's durable commit MUST preserve the operation's original failure. Cleanup failure after a durable Grant replacement, token refresh, or Account removal MUST NOT roll back usable committed state or change the existing public result and exit mapping; it MUST emit one bounded structured warning containing a failure count and safe lifecycle context only.

Warnings and errors MUST NOT contain secret values, OAuth App config keys or values, tokens, typed secret references, or Keychain credential keys.

#### Scenario: Reauthorization cleanup remains pending
- **WHEN** replacement Grant references commit and one or more superseded Keychain entries cannot be deleted
- **THEN** reauthorization succeeds with the replacement Grant and emits one redacted cleanup-pending warning with the failure count

#### Scenario: Refresh cleanup remains pending
- **WHEN** refreshed token references commit and deletion of a superseded token fails
- **THEN** refresh returns the new usable token and emits one redacted cleanup-pending warning without changing its exit behavior

#### Scenario: Rollback cleanup also fails
- **WHEN** a pre-commit authorization or refresh failure is followed by failure to clean newly written temporary entries
- **THEN** the original failure remains authoritative and a separate bounded warning reports only the cleanup failure count
