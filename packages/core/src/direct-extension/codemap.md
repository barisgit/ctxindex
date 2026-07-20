# packages/core/src/direct-extension/

## Responsibility

Installs, updates, inventories, loads, and uninstalls one exact Extension root from explicitly selected npm, Git, or local package targets while keeping startup offline.

## Design

- `target.ts` parses explicit target kinds, rejects credentials, normalizes local origins, and exposes safe requested-target projections.
- `materializer.ts` acquires packages through argv-only Bun execution with lifecycle scripts disabled, snapshots local packages, and returns immutable exact source metadata.
- `schema.ts` owns strict versioned activation records and safe inventory output.
- `store.ts` hashes package trees, serializes lifecycle mutations, atomically publishes content-addressed materializations and records, and collects only unreferenced pins.
- `service.ts` exact-selects one declared Extension export, refreshes the complete validation context inside the lifecycle lock, validates definitions and passive documentation against the active collected roots plus local OAuth Apps, tolerantly inventories unrelated valid records, attaches sanitized target provenance to lifecycle failures, and guards uninstall when Sources require its Adapters.
- `source-bindings.ts` queries only the Source identity and Adapter binding needed by the removal guard through a caller-owned retained database handle; it never opens SQLite itself.

## Data and control flow

Install/update acquires into same-filesystem staging, imports and validates there, publishes the immutable digest, then atomically replaces the activation record. Startup derives the managed package root from a valid record, verifies its digest, and routes the selected root through the common Extension loader without contacting the package manager, network, or original local path.

## Integration points

Exported as `@ctxindex/core/direct-extension`; the CLI lifecycle handler supplies a locked runtime-context loader, local OAuth App identities, and Source bindings. `extension/loader.ts` consumes valid records for offline activation.
