# examples/tenders-extension/

## Responsibility

Provides the official instant-demo external Extension: eight deterministic synthetic procurement Resources with no Provider, Account, secrets, network access, or prepared inputs. The MIT-licensed ESM package `@ctxindex/demo-tenders` advertises a checked self-contained entry while retaining ordinary SDK-authored TypeScript source, fixture data, tests, launch copy, and package-sidecar documentation.

## Design

- `extension.ts` imports `defineProfile`, `defineAdapter`, `defineExtension`, and `z` from the public SDK and exports ordinary plain values.
- `tenderSchema` is strict; `tenderProfile` maps complete payloads into searchable title, occurrence time, two chunks, and seven typed indexes without leaf documentation.
- `tenderAdapter` is providerless, indexed, and sync-only. `TENDER_FIXTURES` is immutable deterministic input.
- `demo-extension.js` bundles the authored source and runtime SDK dependencies for standalone package installation; a byte-freshness test prevents source drift.
- `docs/` contains the required index plus canonical Adapter and versioned Profile pages; `extension.ts` declares it with the pure `docs('./docs')` descriptor. `README.md` and `expected-output.md` own the isolated walkthrough and website/video copy.

## Flow

1. The example manifest advertises `demo-extension.js`; package entry resolution imports it once, collects the exact `ctxindex.demo` root, and binds its adjacent `./docs` descriptor.
2. The root reaches exact `ctxindex.demo.tender` and `ctxindex.demo.tenders` values without an Extension dependency graph.
3. `operations.sync(context)` iterates `TENDER_FIXTURES`, emitting one `upsertResource` per tender with a source-scoped `ctx://` ref and parsed timestamps.
4. Sync emits a final versioned `checkpoint` containing all fixture references.
5. Documentation and complete-registry validation activate the collected graph; providerless execution bypasses authorization resolution.

## Integration

- Uses `@ctxindex/extension-sdk` only while authoring/building and embeds runtime dependencies in the checked package entry; relative `fixtures.ts` is deterministic input.
- Declares `@ctxindex/core` and `@ctxindex/official` as workspace dev dependencies used by tests for package-entry discovery and built-in Extension isolation.
- Exports Profile ID `ctxindex.demo.tender`, Adapter ID `ctxindex.demo.tenders`, and Extension ID `ctxindex.demo` as ordinary values.
- The allowlisted standalone package is self-contained and needs no published SDK; npm publication and anonymous installation remain a launch Human checkpoint.
- Emits sync operations through `context.emit()`; resource refs use `context.source.id`.
