# apps/cli/src/extensions/

## Responsibility

Implements the thin CLI adapter for loaded Extension inspection, trusted package-backed Catalog snapshot build and Git Catalog lifecycle, Catalog search, and managed npm/Git/local package installation.

## Design / patterns

- `command.ts` declares `extensions list`, `extensions search`, nested `extensions catalog build|add|list|show|refresh|remove`, dual Catalog/direct install forms, direct update, and one origin-neutral uninstall form.
- `services.ts` composes `CatalogService`, `CatalogInstallationService`, one shared generic package installer, and direct lifecycle services. `handle-extensions-command.ts` delegates build/install through those seams, defaults Catalog reads and search to refresh, and wires SIGINT cancellation around acquisition/evaluation operations.
- `index.ts` is the bounded barrel re-exported by the compatibility-sized `commands/extensions.ts` descriptor entry.

## Data & control flow

Raw arguments enter the pure `args/extensions.ts` grammar. Catalog build materializes a trusted author package into an inert snapshot; Git Catalog reads and Marketplace search refresh by default while `--no-refresh` uses persisted state offline. Catalog installs replay the exact stored entry through the shared generic installer; direct requests use `DirectExtensionService`. Loaded Extension listing combines offline loading with the unified managed-installation inventory, retaining unavailable records and provenance when a record cannot load. Update and origin-neutral uninstall reload validation context; uninstall retains the Source-binding lease for force checks. Core results flow through Catalog/direct/registry formatters and errors through the stable exit mapper.

## Integration points

Registered by `main.ts` through `commands/extensions.ts`; depends on `@ctxindex/core/catalog`, `@ctxindex/core` package-install/direct-extension seams, CLI definition loading, pure formatters, and exit mapping.
