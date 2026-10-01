## Why

Google and Microsoft calendar synchronization have focused Adapter and workflow coverage, but no shared whole-stack replay proves that both providers preserve the same persisted lifecycle across repeated fresh CLI invocations. A deterministic synthetic replay closes that verification gap without using live provider data or changing production behavior.

## What Changes

- Add test-only automated evidence that replays one common calendar sync lifecycle for Google Calendar and the default Microsoft Calendar.
- Add invented provider-shaped fixtures and provider-specific mock controls for paging, mutation, cursor invalidation, and redacted request inspection.
- Verify persisted Resources, stable Refs, tombstones, Sync Runs, committed cursors, and unchanged replays across fresh CLI processes.
- No production behavior, public interface, schema, cursor format, sync counter, provider scope, or CLI command changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sync-operations`: require deterministic automated calendar replay evidence for the accepted repeated-sync, cursor recovery, and persistence contracts.

## Impact

The change is limited to CLI end-to-end test infrastructure, synthetic fixtures, and provider mocks. It introduces no dependency, live authentication, production provider data, secret handling, schema migration, or runtime security-boundary change.
