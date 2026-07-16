# examples/tenders-extension/

## Responsibility

Provides a deterministic external Extension proof for public-procurement tenders. `extension.ts` defines the Extension, Profile, and fixture-backed sync Adapter; `fixtures.ts` supplies typed sample tender payloads.

## Design

- `extension()` uses the authoring-host factory API (`ExtensionAuthoringHost`) rather than importing runtime internals.
- `tenderSchema` is a strict host-provided Zod schema; `tenderProfile` maps payload fields into searchable title, occurrence time, chunks, and typed indexes.
- `tenderAdapter` is an unauthenticated, indexed, sync-only Adapter. `TENDER_FIXTURES` is immutable deterministic input.

## Flow

1. The Extension loader calls the default `extension(host)` export.
2. `host.defineProfile()` creates `enarocanje.tender`; `host.defineAdapter()` creates `enarocanje.fixture`.
3. `operations.sync(context)` iterates `TENDER_FIXTURES`, emitting one `upsertResource` per tender with a source-scoped `ctx://` ref and parsed timestamps.
4. Sync emits a final versioned `checkpoint` containing all fixture references.
5. `host.defineExtension()` returns `enarocanje.proof` with the Profile and Adapter definitions.

## Integration

- Depends on `@ctxindex/extension-sdk` for `ExtensionAuthoringHost` and on `examples/tenders-extension/fixtures.ts` for `TENDER_FIXTURES`.
- Registers Profile ID `enarocanje.tender`, Adapter ID `enarocanje.fixture`, and Extension ID `enarocanje.proof` with the host.
- Emits sync operations through the host-supplied `context.emit()` boundary; resource refs use `context.source.id`.
