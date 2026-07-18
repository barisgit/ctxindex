## MODIFIED Requirements

### Requirement: Client inventory and removal are deterministic and non-sensitive
`client list` SHALL report configured clients in deterministic provider-then-label order with provider, label, and timestamps, and MUST NOT expose secret references or values. `client list --json` SHALL return a JSON array whose objects contain exactly `provider`, `label`, `createdAt`, and `updatedAt` in that same deterministic order; an empty JSON inventory SHALL return `[]` with exit 0. Omitting `--json` SHALL preserve the existing human-readable inventory format. `client remove <provider> <label>` SHALL delete the identified provider's client record and its secret references; the provider argument scopes label resolution so repeated labels across providers stay unambiguous. Existing Grants keep their own recorded client references and continue refreshing through them.

#### Scenario: Inventory shows no secret material
- **WHEN** `client list` or `client list --json` runs with configured Google and Microsoft clients
- **THEN** output identifies each client by provider and label without secret references, secret values, tokens, or environment-derived credential values

#### Scenario: JSON inventory is deterministic and stable
- **WHEN** `client list --json` runs with multiple configured Clients
- **THEN** it exits 0 with an array ordered by provider then label whose objects contain exactly provider, label, createdAt, and updatedAt

#### Scenario: Empty JSON inventory is an empty array
- **WHEN** `client list --json` runs with no configured Clients
- **THEN** it exits 0 and returns `[]`

#### Scenario: Human inventory remains unchanged
- **WHEN** `client list` runs without `--json`
- **THEN** it uses the existing compact human-readable inventory format

#### Scenario: Removal does not break existing Grants
- **WHEN** a client is removed after authorizing an Account
- **THEN** that Account's Grants still refresh through their own recorded client references
