## ADDED Requirements

### Requirement: Grant secret replacement reports pending cleanup safely
Grant reauthorization and token refresh MUST write replacement secret state before durably swapping references. After the swap commits, failure to delete superseded secret entries MUST NOT roll back or invalidate the usable new Grant, change the existing public success result, or change stable exit mapping. The failure MUST produce one bounded structured warning whose bindings contain only the Provider id, Grant id, lifecycle phase, and failed-entry count. The warning MUST NOT contain Account id, secret value, token, OAuth App configuration, typed secret reference, credential key, caught backend error, or any other sensitive field.

Authorization, refresh, and removal mutations for the same exact Account identity MUST execute in one serialized order within a ctxindex process and MUST re-read current Grant state after entering that order. Concurrent successful replacements MUST leave only the final committed Grant's App and token references authoritative. Superseded physical secret rows MAY remain pending cleanup, but they are not live Grant state and MUST NOT be selected for authorization or refresh. Mutations for unrelated Accounts MUST remain independently executable.

Once Account/Grant removal commits, the absence and cleared Source bindings MUST remain authoritative even if physical secret cleanup fails. Removal MUST retain its committed success and emit the bounded redacted warning. Failed physical deletions MUST remain eligible for safe idempotent retry by typed reference or backend inventory; repeating deletion MUST NOT restore Account/Grant state or fail merely because an earlier attempt already removed the physical secret.

An Account removal that waits behind another mutation MUST revalidate the exact requested label inside the serialized operation. If the Account was renamed while removal waited, removal MUST fail as not found for the stale label and MUST NOT delete the renamed Account, its Grant, or its secrets.

#### Scenario: Reauthorization commits before cleanup warning
- **WHEN** the same Account reauthorizes successfully and deletion of old App or token entries fails
- **THEN** the stable Grant points to the replacement entries and the operation succeeds with one redacted cleanup-pending warning

#### Scenario: Rotated refresh token remains usable
- **WHEN** refresh persists a rotated refresh token and new access token but old-token deletion fails
- **THEN** the new references remain authoritative, the access token is returned, and one redacted cleanup-pending warning records only safe context and a failure count

#### Scenario: Same Account refreshes concurrently
- **WHEN** two refresh operations for the same Account overlap in one process
- **THEN** they execute in order against current Grant state and only the final committed App and token references remain authoritative, even if superseded physical rows remain pending cleanup

#### Scenario: Same Account reauthorizes concurrently
- **WHEN** two successful reauthorizations for the same Provider identity overlap in one process
- **THEN** the stable Grant reflects one complete final authorization and no losing replacement references remain authoritative

#### Scenario: Account removal cleanup remains pending
- **WHEN** Account/Grant removal commits but one or more physical secret deletions fail
- **THEN** committed Account/Grant absence and cleared Source bindings remain authoritative, removal succeeds with one bounded redacted cleanup warning, and repeated deletion of the same typed refs is safe and idempotent

#### Scenario: Removal waits behind Account rename
- **WHEN** removal resolves an old label and then waits behind reauthorization that renames the same Account
- **THEN** removal fails for the stale label and the renamed Account and Grant remain intact
