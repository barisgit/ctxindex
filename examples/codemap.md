# examples/

## Responsibility

Houses external Extension examples that demonstrate the public authoring contract with deterministic data. The current example is the tender fixture Extension detailed in `examples/tenders-extension/codemap.md`.

## Design/patterns

- Each example is self-contained: authored definitions and fixture data live together without importing runtime internals.
- `examples/tenders-extension/extension.ts` uses the host-factory pattern through `ExtensionAuthoringHost`; `fixtures.ts` provides immutable typed inputs.
- The example composes a strict schema, Profile, Adapter, and Extension under stable `enarocanje.*` IDs.

## Data & control flow

1. An Extension loader calls the default `extension(host)` factory in `examples/tenders-extension/extension.ts`.
2. The factory builds `enarocanje.tender` and `enarocanje.fixture`; the Adapter's `operations.sync(context)` iterates `TENDER_FIXTURES`.
3. Sync emits source-scoped `upsertResource` operations and then a versioned `checkpoint` through `context.emit()`.
4. `host.defineExtension()` returns the assembled `enarocanje.proof` definition.

## Integration points

- Public authoring API: `@ctxindex/extension-sdk` (`ExtensionAuthoringHost`).
- Fixture input: `examples/tenders-extension/fixtures.ts` (`TENDER_FIXTURES`, `TenderFixture`).
- Runtime boundary: host-provided `defineProfile()`, `defineAdapter()`, `defineExtension()`, and sync `context.emit()`.
