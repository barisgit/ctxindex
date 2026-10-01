## Capability Implementation Targets

- `sync-operations` -> `openspec/specs/sync-operations/implementation.md`
- `realm-and-source-management` -> `openspec/specs/realm-and-source-management/implementation.md`
- `cli-surface` -> `openspec/specs/cli-surface/implementation.md`

## Module Ownership

Provider-neutral core owns the sync capability predicate, all-Source partitioning into selected and skipped Sources, targeted eligibility rejection, and the effective Source status projection. The daemon only extends its typed sync result projection and RPC schema with the skipped list; it adds no selection logic. The thin CLI only renders the skipped list and zero-eligible summary and maps the daemon result into the same output shape as the direct route.

## Interfaces and Data Flow

```ts
// @ctxindex/core — Source sync capability
export function adapterSupportsSync(
  adapter: Pick<AnyAdapterDefinition, 'capabilities' | 'operations'>,
): boolean;

// @ctxindex/core — multi-Source application result
export interface SkippedSourceSync {
  readonly sourceId: string
  readonly reason: 'disabled' | 'unsupported'
}

export interface RunSyncResult {
  readonly mode: SyncMode
  readonly results: readonly SourceSyncResult[]
  readonly skipped: readonly SkippedSourceSync[]
  readonly warnings: readonly SourceSyncWarning[]
}
```

`SyncApplicationService.run` sorts all listed Sources by id, then classifies each: a loaded Adapter failing `adapterSupportsSync` is `unsupported`, otherwise a stored `sync_enabled: false` is `disabled`, otherwise the Source is selected. A Source without a loaded Adapter is selected. The targeted path resolves the Source and throws `CtxindexValidationError('invalid_filter', ...)` for an unsupported loaded Adapter or disabled policy before `syncSource`, so no lock, Sync Run, or Source state is written. Targeted results always carry `skipped: []`.

`SourceService.getStatus` reads the stored policy alongside sync state and derives the effective status after the query using the loaded registry and `adapterSupportsSync`. The daemon `rpcSyncResultSchema` adds a bounded strict `skipped` array of `{ sourceId, reason }`; status rows already carry `lastStatus` as a bounded string and need no schema change. The CLI `SyncOutput` adds `skipped`, and `formatSyncOutput` renders it for summary and compact formats.

## Storage and State

No schema, migration, or stored value changes. Skipped Sources and targeted rejections write no Sync Run, lock, cursor, or `source_sync_state` row. The status projection is read-only.

## Security and Compatibility

The skipped list exposes only Source ids and closed reason codes. No provider egress or credential resolution occurs for skipped or rejected Sources. The JSON sync shape gains one field without a compatibility alias, consistent with the pre-alpha policy.

## Verification

Core application-service tests cover mixed selection with skipped reasons and ordering, zero-eligible results, unsupported-over-disabled precedence, missing-Adapter selection, and targeted unsupported rejection without `syncSource` calls. Core Source service tests cover status projection for pending, disabled, unsupported, needs_auth precedence, and recorded run status. CLI sync tests cover summary, compact, and JSON rendering of skipped Sources and the zero-eligible summary for direct and daemon routes, plus targeted unsupported exit `2`. RPC schema tests cover the skipped field. CLI and compiled-daemon end-to-end tests cover real direct and daemon sync/status with mixed Sources and prove no Sync Run is created for skipped or rejected Sources.

## Promotion Notes

- `openspec/specs/sync-operations/implementation.md`: add `adapterSupportsSync`, `SkippedSourceSync`, the `skipped` member of `RunSyncResult`, the selection classification and targeted rejection order, and the new verification coverage.
- `openspec/specs/realm-and-source-management/implementation.md`: record the effective status projection precedence derived in `getStatus` from stored state, policy, and loaded Adapter capability, and its verification.
- `openspec/specs/cli-surface/implementation.md`: record that the CLI renders the core skipped list and zero-eligible summary for both routes without its own selection logic.
