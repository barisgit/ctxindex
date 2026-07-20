# apps/cli/src/extensions/

## Responsibility

Implements the thin CLI adapter for loaded Extension inspection, trusted Git Catalog lifecycle commands, and direct npm/Git/local package installation.

## Design / patterns

- `command.ts` declares the citty tree for `extensions list`, nested `extensions catalog` lifecycle verbs, dual Catalog/direct install and uninstall forms, and direct update.
- `handle-extensions-command.ts` delegates Catalog behavior to `CatalogService` and direct behavior to `DirectExtensionService`, supplying the runtime-complete registry, persisted local OAuth App identities, and Source bindings before selecting pure formatters.
- `index.ts` is the bounded barrel re-exported by the compatibility-sized `commands/extensions.ts` descriptor entry.

## Data & control flow

Raw arguments enter the pure `args/extensions.ts` grammar. Valid Catalog requests delegate to `CatalogService`; direct requests acquire and validate one exact root through `DirectExtensionService`. Loaded Extension listing uses `loadCliDefinitions()` so Catalog and direct provenance participate in the same offline startup loader. Core results flow through Catalog/direct/registry formatters and errors through the stable exit mapper.

## Integration points

Registered by `main.ts` through `commands/extensions.ts`; depends on `@ctxindex/core/catalog`, `@ctxindex/core/direct-extension`, CLI definition loading, pure formatters, and exit mapping.
