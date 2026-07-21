## Capability Implementation Targets

- `oauth-client-management` → `openspec/specs/oauth-client-management/implementation.md`

## Module Ownership

`@ctxindex/core` continues to own deterministic Client inventory retrieval and its non-sensitive `OAuthClientRecord` boundary. The thin CLI owns `--format json` parsing, generated command metadata, and rendering that record through an explicit safe-field projection. No storage or Client service behavior moves into the CLI.

## Interfaces and Data Flow

The closed CLI Client argument union carries whether list output is JSON. `handleClientCommand()` calls `OAuthClientService.listClients()` once, then selects either the existing text formatter or a JSON formatter that projects only `provider`, `label`, `createdAt`, and `updatedAt`. The service interface and `OAuthClientRecord` remain unchanged.

## Storage and State

Not applicable. The read path uses the existing Client metadata query and creates no durable or ephemeral state beyond the command result.

## Security and Compatibility

The JSON formatter must enumerate safe metadata fields explicitly and must never serialize database rows, credential references, Secret Vault values, tokens, or environment input. The default text formatter and Client add/remove paths remain unchanged. The new opt-in form is additive and needs no migration.

## Verification

Argument tests cover `--format json` acceptance and rejection of unsupported list options. Formatter or CLI e2e tests cover the exact output shape, empty array, deterministic provider-then-label ordering, secret redaction, and unchanged text output. Repository CLI-boundary gates, full CI, and strict OpenSpec validation cover cross-cutting regressions.

## Promotion Notes

Before archive, update `openspec/specs/oauth-client-management/implementation.md` to state that the CLI owns an explicit safe metadata projection for JSON Client inventory and to add the JSON shape, empty-state, ordering, redaction, and text-compatibility coverage to its verification doctrine.
