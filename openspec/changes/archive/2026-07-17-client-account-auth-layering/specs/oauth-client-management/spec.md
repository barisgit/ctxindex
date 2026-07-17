## ADDED Requirements

### Requirement: OAuth clients are explicit labeled per-provider records
`client add <provider>` SHALL create one persisted OAuth client record for a provider id declared by a loaded declarative OAuth provider spec, rejecting unknown provider ids before any credential input, secret write, or network activity. Client credentials MUST be read through the provider's declared environment names when `--from-env` is selected and MUST NOT be accepted as literal argv secret values. The client id and any secret SHALL be persisted only through the configured secrets backend as typed references, with metadata recording provider, label, and timestamps; a persistence failure MUST clean every newly written secret reference.

#### Scenario: Client for an unloaded provider is rejected
- **WHEN** `client add fastmail` runs while no loaded Adapter declares an OAuth provider `fastmail`
- **THEN** the command fails with invalid usage before reading credentials or writing secrets

#### Scenario: Client credentials come from declared environment names
- **WHEN** `client add google --from-env` runs with the provider's declared client-id environment value set
- **THEN** the client record persists that id through the secrets backend and no secret value appears in argv or logs

#### Scenario: Failed persistence leaves no orphan secrets
- **WHEN** client metadata persistence fails after secret references are written
- **THEN** every newly written reference is cleaned and no client record exists

### Requirement: Client labels default to the provider id and are unique per provider
A client label SHALL default verbatim to the provider id when `--label` is omitted and MUST be unique among that provider's clients. A collision with an existing label for the same provider MUST fail as invalid usage naming the taken label and suggesting `--label`; the system MUST NOT auto-suffix, prompt, or overwrite. Labels for different providers MAY repeat.

#### Scenario: Second unlabeled client for one provider collides
- **WHEN** `client add google` runs while a Google client labeled `google` exists
- **THEN** the command fails with invalid usage naming `google` and suggesting `--label`, and no record is written

#### Scenario: Same label under different providers coexists
- **WHEN** Google and Microsoft clients both use the label `default`
- **THEN** both records exist and each resolves only within its provider

### Requirement: Client inventory and removal are deterministic and non-sensitive
`client list` SHALL report configured clients in deterministic order with provider, label, and timestamps, and MUST NOT expose secret references or values. `client remove <provider> <label>` SHALL delete the identified provider's client record and its secret references; the provider argument scopes label resolution so repeated labels across providers stay unambiguous. Existing Grants keep their own recorded client references and continue refreshing through them.

#### Scenario: Inventory shows no secret material
- **WHEN** `client list` runs with configured Google and Microsoft clients
- **THEN** output identifies each client by provider and label without secret references or values

#### Scenario: Removal does not break existing Grants
- **WHEN** a client is removed after authorizing an Account
- **THEN** that Account's Grants still refresh through their own recorded client references

### Requirement: Account authorization resolves one provider-matched client
`account add <provider>` SHALL resolve its OAuth client only among that provider's persisted client records. With exactly one such client it MUST be used without `--client`; with none the command MUST fail directing the user to `client add`; with several it MUST require `--client <label>` and list the available labels on omission or mismatch. Runtime authorization MUST NOT resolve client credentials from environment variables.

#### Scenario: Single client is used silently
- **WHEN** `account add google` runs with exactly one Google client configured
- **THEN** authorization uses that client without a `--client` flag

#### Scenario: Missing client is actionable
- **WHEN** `account add microsoft` runs with no Microsoft client configured
- **THEN** the command fails directing the user to `client add microsoft`

#### Scenario: Ambiguous client requires selection
- **WHEN** two Google clients exist and `account add google` omits `--client`
- **THEN** the command fails listing both labels, and a Microsoft client label is never a candidate
