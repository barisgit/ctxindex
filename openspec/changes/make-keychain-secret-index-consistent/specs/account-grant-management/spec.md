## ADDED Requirements

### Requirement: Grant secret replacement reports pending cleanup safely
Grant reauthorization and token refresh MUST write replacement secret state before durably swapping references. After the swap commits, failure to delete superseded secret entries MUST NOT roll back or invalidate the usable new Grant, change the existing public success result, or change stable exit mapping. The failure MUST produce one bounded structured warning containing the Provider, Grant id, lifecycle phase, and failed-entry count but no secret value, token, OAuth App configuration, typed secret reference, or credential key.

Authorization, refresh, and removal mutations for the same exact Account identity MUST execute in one serialized order within a ctxindex process and MUST re-read current Grant state after entering that order. Concurrent successful replacements MUST leave only the final committed Grant's App and token references live. Mutations for unrelated Accounts MUST remain independently executable.

#### Scenario: Reauthorization commits before cleanup warning
- **WHEN** the same Account reauthorizes successfully and deletion of old App or token entries fails
- **THEN** the stable Grant points to the replacement entries and the operation succeeds with one redacted cleanup-pending warning

#### Scenario: Rotated refresh token remains usable
- **WHEN** refresh persists a rotated refresh token and new access token but old-token deletion fails
- **THEN** the new references remain authoritative, the access token is returned, and one redacted cleanup-pending warning records only safe context and a failure count

#### Scenario: Same Account refreshes concurrently
- **WHEN** two refresh operations for the same Account overlap in one process
- **THEN** they execute in order against current Grant state and only the final App and token references remain live

#### Scenario: Same Account reauthorizes concurrently
- **WHEN** two successful reauthorizations for the same Provider identity overlap in one process
- **THEN** the stable Grant reflects one complete final authorization and no losing replacement references remain live
