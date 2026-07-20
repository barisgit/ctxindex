# packages/core/src/extension/fixtures/

## Responsibility

Provides minimal external package roots and modules representing successful, invalid, and conflicting exported-value definitions for the production loading contract.

## Design

- The `*-package/` directories declare contained entry modules through `package.json` `ctxindex.extensions`; fixtures do not model or resolve an extension dependency graph.
- Fixture modules use ordinary `@ctxindex/extension-sdk` imports and export Extension values directly; no host callback is invoked.
- `valid-extension.ts` defines a searchable `fixture.note` profile in `fixture.external`.
- `invalid-extension.ts` exports both a valid sibling and an Extension containing an incomplete retrieve Adapter, proving per-package atomic failure.
- `conflicting-extension.ts` declares a structurally different `fixture.builtin`, representing a semantic conflict with a built-in Extension.

## Data & control flow

The loader resolves a fixture package manifest, imports its declared entry once, collects named/default Extension exports, and passes all collected roots to complete candidate validation.

## Integration points

- Uses ordinary factories from `@ctxindex/extension-sdk` at module evaluation time.
- Loaded through the shared package-entry path in `packages/core/src/extension/loader.ts` rather than imported by production core modules.
- Definition acceptance or rejection is owned by `packages/core/src/registry/`.
