> **SUPERSEDED — DO NOT SYNC.** This completed Client-era change is retained only as historical evidence. `redesign-extension-sdk` removes the Client surface and replaces it with `oauth-app list --json`. Its delta spec MUST NOT be synced into canonical specs. Archive only with explicit user approval.

## Context

The core Client service already returns deterministic, non-sensitive `OAuthClientRecord` values containing only provider, label, and timestamps. The CLI currently renders those values only as compact text, while other primary inventory commands expose opt-in JSON. The CLI is the agent integration surface, so presentation-text parsing is an unnecessary source of fragility.

## Goals / Non-Goals

**Goals:**

- Expose the existing safe Client records through `client list --json`.
- Keep the JSON shape and order deterministic.
- Preserve byte-for-byte behavior of the existing text path.

**Non-Goals:**

- Changing Client persistence or service interfaces.
- Adding JSON modes to Client mutations.
- Changing Account, Grant, or Source inventory.

## Decisions

`--json` uses an explicit CLI projection from the `OAuthClientRecord[]` returned by the core service. That type is already the intentional non-sensitive service boundary and contains `provider`, `label`, `createdAt`, and `updatedAt`; naming those fields in the formatter prevents future service-record expansion from exposing new metadata unintentionally.

The handler selects JSON or the existing formatter after a single `listClients()` call. This preserves the established text output and the service's `ORDER BY provider, label` ordering in both forms.

## Risks / Trade-offs

- The JSON property names become an agent-facing contract. Mitigation: use the existing stable service record names and cover the exact shape in tests.
- Future fields added to `OAuthClientRecord` could expand JSON unintentionally. Mitigation: format JSON through an explicit safe metadata projection rather than serializing storage rows or internal secret-bearing types.

## Migration Plan

Not applicable. No persistent state or existing default output changes.

## Open Questions

None.
