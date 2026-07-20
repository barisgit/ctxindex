# apps/cli/src/extensions/

## Responsibility

Implements the thin CLI adapter for loaded Extension inspection, trusted Git Catalog lifecycle commands, and direct npm/Git/local package installation.

## Design / patterns

- `command.ts` declares the citty tree for `extensions list`, nested `extensions catalog` lifecycle verbs, dual Catalog/direct install and uninstall forms, and direct update.
- `handle-extensions-command.ts` delegates Catalog behavior to `CatalogService` and direct behavior to `DirectExtensionService`, enables default Catalog refresh, and reads persisted local OAuth App identities and direct-uninstall Source bindings behind retained shared database leases. Direct install/update/uninstall refresh their complete validation context inside Core's lifecycle lock; install/update also wire SIGINT cancellation around the trust-granting lifecycle call.
- `index.ts` is the bounded barrel re-exported by the compatibility-sized `commands/extensions.ts` descriptor entry.

## Data & control flow

Raw arguments enter the pure `args/extensions.ts` grammar. Valid Catalog requests refresh before reading by default, while `--no-refresh` uses the persisted pin offline; direct requests acquire and validate one exact root through `DirectExtensionService`. Loaded Extension listing combines the offline loader with tolerant persisted direct inventory so unrelated valid and unavailable pins remain visible with exact timestamps when another record is invalid. Every direct mutation reloads its validation inputs inside serialized validation; uninstall also reads Source bindings through a lease retained from before its readonly SQLite open through close. Exclusive daemon ownership yields a bounded actionable diagnostic. Core results flow through Catalog/direct/registry formatters and errors through the stable exit mapper.

## Integration points

Registered by `main.ts` through `commands/extensions.ts`; depends on `@ctxindex/core/catalog`, `@ctxindex/core/direct-extension`, CLI definition loading, pure formatters, and exit mapping.
