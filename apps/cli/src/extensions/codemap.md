# apps/cli/src/extensions/

## Responsibility

Implements the thin CLI adapter for loaded Extension inspection, trusted package-backed Catalog snapshot build and Git Catalog lifecycle, nested Catalog search, and provenance-aware Extension install/update/uninstall.

## Design / patterns

- `command.ts` declares the singular `extension` command tree with typed `defineCtxCommand` nodes: `extension list`, nested `extension catalog build|add|list|show|search|refresh|remove`, uniform `extension install <catalog|npm|git|local> <target> <extension-id>`, `extension update`, and origin-neutral `extension uninstall`. Loaded inventory resolves shared pretty/text/json output; lifecycle receipts remain terse and Catalog formats are unchanged. There is no extension-specific raw argument parser.
- `services.ts` composes `CatalogService`, `CatalogInstallationService`, one shared `GenericExtensionPackageInstaller`, `DirectExtensionService`, and `InstalledExtensionLifecycleService` under the same explicit config/data roots. The lifecycle service uses persisted installation records to route updates through the matching Catalog or direct-package acquisition path. Active-state validation reloads definitions and installed materializations through those roots. It injects the generic daemon-aware mutation coordinator without making core installation services depend on daemon packages.
- `daemon-coordination.ts` snapshots daemon status, gracefully stops a live daemon, retains direct shared database ownership for the full Extension mutation, releases it, and restores only a previously running daemon. Callback failures remain primary when restoration also fails; unsupported platforms retain the direct path.
- `handle-extensions-command.ts` dispatches the typed `ExtensionCommandInput` union, defaults Catalog reads and search to refresh, and wires SIGINT cancellation around acquisition/evaluation operations. Catalog build/add require explicit trust acknowledgement; install and update print the in-process execution trust notice before acquisition, while install/update/uninstall execute through the mutation coordinator and update delegates provenance resolution to the lifecycle service.
- `index.ts` is the bounded barrel re-exported by the thin `commands/extensions.ts` registration module.

## Data & control flow

Typed arguments flow from the `defineCtxCommand` tree into `handleExtensionsCommand`. Catalog build materializes a trusted author package into an inert snapshot; Git Catalog reads and nested Marketplace search refresh by default while `--no-refresh` uses persisted state offline. The uniform install command validates the source kind, then enters daemon maintenance coordination and sends Catalog targets through `CatalogInstallationService` or npm/Git/local targets through `DirectExtensionService`; both persist managed installation provenance. The retained shared database lease prevents daemon startup from loading registry state during any installed-state mutation. Loaded Extension listing combines offline loading with the managed-installation inventory, retaining unavailable records and provenance when a record cannot load. Update asks `InstalledExtensionLifecycleService` to reacquire from persisted provenance. Origin-neutral uninstall reloads validation context and Source bindings inside the same ownership interval for force checks. Core results flow through Catalog/direct/registry formatters and errors through the stable exit mapper.

## Integration points

Registered by `main.ts` through `commands/extensions.ts`; depends on `@ctxindex/core/catalog`, `@ctxindex/core` package-install/direct-extension seams, CLI definition loading, CLI daemon lifecycle/direct ownership, pure formatters, and exit mapping.
