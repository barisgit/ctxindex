## MODIFIED Requirements

### Requirement: Typed sync errors and stable CLI exits
Adapters MUST surface failure as a typed `CtxindexSyncError` (or subclass) carrying one of the following codes. The sync runner is the only component that translates these into persisted `sync_runs.status` and `source_sync_state.last_status`.

```text
CtxindexSyncError codes
  auth_expired             refresh token still valid; access token expired and refresh failed
  auth_revoked             refresh token rejected; user must re-authorize
  rate_limited             provider rate or quota limit, with retryAfterMs when known
  network                  DNS/TCP/TLS failure or timeout
  provider_unavailable     5xx from provider
  provider_bad_response    response parse / Zod-validation failure
  provider_quota           account quota exhausted
  not_found                resource referenced by cursor no longer exists
  permission_denied        403 / scope mismatch from provider
  cancelled                aborted by SIGINT, SIGTERM, or explicit cancel
  unknown                  fallback; MUST include cause for diagnostics
```

Adapters MAY also yield non-fatal warning ops that increment `sync_runs.errors_count` and append to `error_summary` without aborting the run.

Mapping rules remain normative:

- `sync_runs.status` = `completed` only when the iterator completes without throwing.
- `sync_runs.status` = `cancelled` when the cause was `cancelled`.
- `sync_runs.status` = `failed` for every other code.
- `source_sync_state.last_status` = `needs_auth` for `auth_expired | auth_revoked`.
- `source_sync_state.last_status` = `idle` after a `completed` run.
- `source_sync_state.last_status` = `failed` for every other terminal error.
- `source_sync_state.last_status` = `disabled` is set only by the CLI, never by the runner.

User-visible stable exits remain: `0` success, `2` invalid usage, `10` `needs_auth`, `20` rate-limited, `30` network/provider or external acquisition failure, `40` permission denied, `50` other sync, validation, conflict, or internal auth failure, and `130` cancelled by SIGINT. OAuth App, Account, and Source label collisions MUST exit `2`, name the taken label, make no change, and MUST NOT prompt, normalize, automatically suffix, or choose a winner.

The public/internal authentication error code `missing_oauth_client_creds` MUST be removed and replaced by `missing_oauth_app_config`. No alias SHALL remain. `missing_oauth_app_config` MUST retain the removed code's stable `50` exit mapping when authorization or refresh discovers absent or corrupt persisted App or Grant-snapshot configuration.

Unknown Provider or App selection, omitted required `account add --app`, and invalid or missing `oauth-app add --from-env` config are invalid usage and MUST exit `2` with actionable OAuth App guidance. Unknown selection MUST fail before environment/secret reads, database mutation, browser launch, or Provider egress. Missing or invalid assembled config MUST fail before secret-store writes, database mutation, browser launch, or Provider egress. These add-time validation failures MUST NOT use `missing_oauth_app_config` because no persisted authorization state was expected yet.

Direct Extension lifecycle failures MUST use these stable public codes and exits:

```text
extension_target_invalid       2   source kind, target syntax, selector, or already-installed/not-installed lifecycle usage is invalid
extension_trust_required       2   acquisition or import was requested without an explicit install/update trust grant
extension_removal_blocked      2   dependent Sources forbid non-forced uninstall
extension_acquisition_failed  30   package-manager, registry, Git, local-read, or dependency materialization failed
extension_validation_failed   50   manifest, collection, exact selection, integrity, or definition validation failed
extension_conflict            50   complete candidate-registry identity/conflict validation failed
```

Every direct lifecycle failure MUST identify its stage with sanitized provenance, MUST NOT expose embedded or ambient credentials, and MUST leave prior direct records, materializations, active definitions, Sources, and Source-owned data unchanged. Parser-level target/selector failures MUST occur before package-manager, filesystem acquisition, import, or persistence effects. `extension_trust_required` MUST occur before acquisition or import. `extension_removal_blocked` MUST list blocking Sources and MUST occur before installation mutation. Acquisition, validation, and conflict failures MUST discard staged candidates without replacing a prior valid installation.

#### Scenario: Missing persisted App snapshot uses renamed error
- **WHEN** authorization or refresh requires persisted App config that is absent or corrupt
- **THEN** core reports `missing_oauth_app_config`, CLI exits `50`, and no `missing_oauth_client_creds` alias is emitted

#### Scenario: Unknown App selection is invalid usage
- **WHEN** `account add google --app absent` selects no available App
- **THEN** CLI exits `2` before secret/database/browser/network effects with exact App guidance

#### Scenario: Missing environment config is invalid usage
- **WHEN** `oauth-app add google work --from-env` cannot assemble a valid Provider config
- **THEN** CLI exits `2` before secret-store writes, database mutation, browser launch, or Provider egress

#### Scenario: Invalid direct target is effect-free usage failure
- **WHEN** a direct install target or exact Extension selector is syntactically invalid
- **THEN** core reports `extension_target_invalid`, CLI exits `2`, and no acquisition, import, materialization, or record write occurs

#### Scenario: Package acquisition fails atomically
- **WHEN** package-manager resolution or materialization fails during install or update
- **THEN** core reports `extension_acquisition_failed`, CLI exits `30`, and any prior installation remains unchanged

#### Scenario: Candidate conflict preserves active state
- **WHEN** a materialized direct candidate conflicts with the complete active registry
- **THEN** core reports `extension_conflict`, CLI exits `50`, and staged state is discarded without choosing a winner

#### Scenario: Dependent Sources block normal removal
- **WHEN** uninstall without force would make configured Sources unavailable
- **THEN** core reports `extension_removal_blocked`, CLI exits `2`, and the blocking Sources plus installation remain unchanged

#### Scenario: Typed sync mapping remains stable
- **WHEN** a typed sync failure reaches the runner and CLI
- **THEN** persisted status and exit mapping remain unchanged by direct Extension installation
