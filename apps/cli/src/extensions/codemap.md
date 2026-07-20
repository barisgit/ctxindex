# apps/cli/src/extensions/

## Responsibility

Implements the thin CLI adapter for loaded Extension inspection and trusted Git Catalog lifecycle commands.

## Design / patterns

- `command.ts` declares the citty tree for `extensions list`, nested `extensions catalog` lifecycle verbs, and install/uninstall.
- `handle-extensions-command.ts` parses raw argv, delegates all Catalog behavior to core `CatalogService`, enables refresh by default for Catalog list/show/install unless `--no-refresh` is present, and supplies active roots plus persisted local OAuth App identities for complete install validation before selecting pure formatters. Runtime Extension identity/provenance matches by stable id; the selected Catalog version remains acquisition input.
- `index.ts` is the bounded barrel re-exported by the compatibility-sized `commands/extensions.ts` descriptor entry.

## Data & control flow

Raw arguments enter the pure `args/extensions.ts` grammar. Valid Catalog requests delegate to `CatalogService`; list/show/install refresh before reading by default, while `--no-refresh` uses the persisted pin and snapshot offline. Loaded Extension listing uses `loadCliDefinitions()` so id-only runtime inventory and installed provenance participate in the same offline startup loader. Install still forwards the requested Catalog package version as acquisition provenance. Core results flow through Catalog/registry formatters and errors through the stable exit mapper.

## Integration points

Registered by `main.ts` through `commands/extensions.ts`; depends on `@ctxindex/core/catalog`, CLI definition loading, pure formatters, and exit mapping.
