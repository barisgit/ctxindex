## Why

Global `ctxindex sync` silently succeeds when every configured Source uses an Adapter without local sync support, and `status` reports those Sources as `pending` forever. Mailbox Adapters are federated-only, so they are filtered out of all-Source sync, yet Source creation defaults sync to enabled and status projects never-run work. Status therefore conflates three different states: never run, disabled by the user, and impossible because the Adapter cannot sync. A targeted sync of such a Source also creates a failed Sync Run and failed Source state instead of being rejected as a selection error. Agents and users cannot tell from either command what will happen or why nothing did.

## What Changes

- Define sync eligibility from both the Source sync policy and the loaded Adapter's sync capability.
- All-Source sync reports every ineligible Source in a deterministic `skipped` selection list with a `disabled` or `unsupported` reason, and a zero-eligible run emits an explicit deterministic human summary and structured JSON instead of silently succeeding.
- Targeting a Source whose loaded Adapter cannot sync fails as invalid usage (exit `2`) before any Sync Run, Source state change, or provider operation, matching the existing disabled-Source rejection.
- `status` reports a capability-aware effective sync status: `pending` only for eligible never-run Sources, `disabled` for user-disabled Sources, and `unsupported` for Sources whose Adapter cannot sync.
- Direct and daemon routes produce the same selection, output, status, and exit outcomes. Calendar and local-directory sync behavior is unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sync-operations`: Capability-aware sync eligibility, skipped-Source selection reporting, and targeted unsupported-Source rejection before effects.
- `realm-and-source-management`: Capability-aware effective Source sync status.
- `cli-surface`: Deterministic sync selection output for summary, compact, and JSON formats, including the zero-eligible summary.

## Impact

The change affects provider-neutral core sync selection and Source status projection, the daemon sync RPC result schema and projection, CLI sync rendering, focused unit and end-to-end tests, user-facing troubleshooting docs, and codemaps. It adds no schema migration, persistent state, provider operation, or CLI flag. The sync JSON document gains a `skipped` field; the pre-alpha repository adds no compatibility alias.
