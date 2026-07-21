## Why

Some Sources support useful remote operations but should not participate in routine synchronization. Source creation currently always relies on the database default that enables sync, so callers cannot express this independent per-Source policy through the CLI or service contract.

## What Changes

- Allow Source creation to explicitly disable sync while preserving sync-enabled creation as the default.
- Add one bare `--no-sync` flag to `source add`, with strict rejection of assignments, repetitions, and malformed forms before persistent state is opened.
- Persist the selected sync policy in the existing `sources.sync_enabled` column and expose it as `syncEnabled` in `source list --format json`.
- Preserve existing behavior in which all-Source sync skips disabled Sources and targeted sync rejects a disabled Source before invoking its provider.
- Do not mutate existing Sources and do not add a schema migration.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `realm-and-source-management`: Source creation accepts and reports an explicit per-Source sync policy.
- `sync-operations`: Disabled Sources remain excluded from all-Source sync and fail targeted sync without provider access.

## Impact

The change affects the provider-neutral core Source input and persistence contract plus Source CLI parsing, generated Citty arguments, delegation, and JSON formatting. It uses the existing database column and does not change provider configuration, Account/Grant resolution, search routing, schema, or migration behavior.
