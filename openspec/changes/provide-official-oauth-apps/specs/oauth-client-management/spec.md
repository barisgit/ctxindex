## MODIFIED Requirements

### Requirement: Account authorization selects an OAuth App
An OAuth2 Account authorization request MUST resolve exactly one active Extension or local OAuth App by Provider id and exact label before credential reads or network effects. When the caller supplies `--app <label>`, that exact label MUST be used and managed-default resolution MUST be bypassed. When the caller omits `--app`, core MUST resolve an exact label only from one matching host-designated managed App for that Provider; it MUST NOT infer an App from load order, config, client id, origin priority, or the number of local or otherwise active Apps. The resolved App's validated config and its exact imported active Provider supply authorization metadata. Public commands, descriptions, and inventories MUST use OAuth App vocabulary and MUST NOT expose Client or private Grant concepts.

#### Scenario: Explicit label remains exact
- **WHEN** a Provider has several Apps with distinct labels and `--app work` is supplied
- **THEN** Account authorization resolves only the exact `work` label and never consults managed-default priority

#### Scenario: One managed App permits omission
- **WHEN** `--app` is omitted and one active App exactly matches host managed-App policy for the Provider
- **THEN** its exact label is resolved before credential reads or network effects

#### Scenario: Unknown or unavailable App fails before effects
- **WHEN** explicit App selection is absent/unknown or managed-default resolution finds no exact eligible App
- **THEN** it fails before secret reads/writes, persistence, browser launch, or Provider egress
