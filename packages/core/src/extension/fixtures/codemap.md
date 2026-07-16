# packages/core/src/extension/fixtures/

## Responsibility

Provides minimal external extension modules representing successful, invalid, and conflicting definitions for exercising the production extension-loading contract.

## Design

- Every fixture default-exports the same factory shape accepted by `packages/core/src/extension/loader.ts` and builds definitions only through `ExtensionAuthoringHost`.
- `valid-extension.ts` defines a searchable `fixture.note` profile in `fixture.external`.
- `invalid-extension.ts` declares a retrieve-capable adapter with an empty operations object, producing an intentionally incomplete definition.
- `conflicting-extension.ts` declares `fixture.builtin`, representing an identifier collision with a built-in extension.

## Data & control flow

A loader dynamically imports a fixture path, invokes its default factory with the SDK authoring host, receives an extension definition, and passes that definition to registry registration and validation.

## Integration points

- Implements the `ExtensionAuthoringHost` contract from `@ctxindex/extension-sdk`.
- Loaded through the dynamic-import path in `packages/core/src/extension/loader.ts` rather than imported by production core modules.
- Definition acceptance or rejection is owned by `packages/core/src/registry/`.
