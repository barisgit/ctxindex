# examples/

## Responsibility

Houses external Extension examples that demonstrate the public authoring contract with deterministic data. The current example is the tender fixture Extension detailed in `examples/tenders-extension/codemap.md`.

## Design/patterns

- Each example is a root workspace package: `package.json` declares ordered `ctxindex.extensions` module entries, runtime authoring dependencies, and any test-only public-package dependencies.
- `examples/tenders-extension/extension.ts` exports ordinary SDK definition values; `fixtures.ts` provides immutable typed inputs.
- The example composes a strict schema, Profile, Adapter, and Extension under stable `enarocanje.*` IDs.

## Data & control flow

1. Core resolves `package.json`'s `./extension.ts` entry and imports its module namespace once.
2. Export collection selects the ordinary `enarocanje.proof` Extension root and reaches its exact Profile/Adapter values; `operations.sync(context)` iterates `TENDER_FIXTURES`.
3. Sync emits source-scoped `upsertResource` operations and then a versioned `checkpoint` through `context.emit()`.
4. The providerless Adapter performs no Account, Grant, token, or Provider egress resolution.

## Integration points

- Workspace boundary: the root manifest includes `examples/*`; the dependency verifier scans each example's production and test imports while allowing dependencies only on public `packages/*` workspaces.
- Public authoring API: `@ctxindex/extension-sdk` factories and SDK-exported `z`, declared as a runtime `workspace:*` dependency. `@ctxindex/core` and `@ctxindex/adapters` are test-only `workspace:*` dev dependencies for package discovery and built-in isolation checks.
- Fixture input: `examples/tenders-extension/fixtures.ts` (`TENDER_FIXTURES`, `TenderFixture`).
- Runtime boundary: package-entry discovery, exported-value collection, complete-registry validation, and sync `context.emit()`.
