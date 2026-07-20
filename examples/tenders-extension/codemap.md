# examples/tenders-extension/

## Responsibility

Provides a deterministic package-managed external Extension proof for public-procurement tenders. The private ESM workspace package `@ctxindex/example-tenders-extension` advertises `extension.ts` through `ctxindex.extensions`; the module defines the Extension, Profile, and fixture-backed sync Adapter.

## Design

- `extension.ts` imports `defineProfile`, `defineAdapter`, `defineExtension`, and `z` from the public SDK and exports ordinary plain values.
- `tenderSchema` is strict; `tenderProfile` maps payload fields into searchable title, occurrence time, chunks, and typed indexes without embedded docs.
- `tenderAdapter` is providerless, indexed, and sync-only. `TENDER_FIXTURES` is immutable deterministic input.

## Flow

1. Package entry resolution reads `./extension.ts`, imports it once, and collects the default `enarocanje.proof` root.
2. The root reaches exact `enarocanje.tender` and `enarocanje.fixture` values without an Extension dependency graph.
3. `operations.sync(context)` iterates `TENDER_FIXTURES`, emitting one `upsertResource` per tender with a source-scoped `ctx://` ref and parsed timestamps.
4. Sync emits a final versioned `checkpoint` containing all fixture references.
5. Complete-registry validation activates the collected graph; providerless execution bypasses authorization resolution.

## Integration

- Declares `@ctxindex/extension-sdk` as its runtime workspace dependency and uses relative `fixtures.ts` for deterministic input.
- Declares `@ctxindex/core` and `@ctxindex/adapters` as workspace dev dependencies used by tests for package-entry discovery and built-in Extension isolation.
- Exports Profile ID `enarocanje.tender`, Adapter ID `enarocanje.fixture`, and Extension ID `enarocanje.proof` as ordinary values.
- Emits sync operations through `context.emit()`; resource refs use `context.source.id`.
