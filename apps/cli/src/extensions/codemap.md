# apps/cli/src/extensions/

## Responsibility

Implements the thin CLI adapter for loaded Extension inspection, trusted Git Catalog lifecycle commands, and direct npm/Git/local package installation.

## Design / patterns

- `command.ts` declares the citty tree for `extensions list`, nested `extensions catalog` lifecycle verbs, dual Catalog/direct install and uninstall forms, and direct update.
- `handle-extensions-command.ts` delegates Catalog behavior to `CatalogService` and direct behavior to `DirectExtensionService`, enables default Catalog refresh, supplies active collected roots and Source bindings, and reads persisted local OAuth App identities behind a retained shared database lease before Catalog or direct validation. Direct install/update additionally wire SIGINT cancellation around the trust-granting lifecycle call.
- `index.ts` is the bounded barrel re-exported by the compatibility-sized `commands/extensions.ts` descriptor entry.

## Data & control flow

Raw arguments enter the pure `args/extensions.ts` grammar. Valid Catalog requests refresh before reading by default, while `--no-refresh` uses the persisted pin offline; direct requests acquire and validate one exact root through `DirectExtensionService`. Loaded Extension listing combines the offline loader with strict persisted direct inventory so unavailable pins remain visible with exact timestamps. Install/update first perform the leased local-App identity read and report bounded ownership diagnostics on exclusive daemon contention. Core results flow through Catalog/direct/registry formatters and errors through the stable exit mapper.

## Integration points

Registered by `main.ts` through `commands/extensions.ts`; depends on `@ctxindex/core/catalog`, `@ctxindex/core/direct-extension`, CLI definition loading, pure formatters, and exit mapping.
