## Why

An Extension can currently be loaded from an explicit local path or installed through a Catalog, but a Catalog should be optional discovery rather than a prerequisite for using a package. Authors and users need one persistent, safe workflow that accepts an npm package, Git repository, or local package directly, lets the package manager resolve ordinary dependencies, and keeps the chosen code available across offline ctxindex starts.

## What Changes

- Add persistent direct Extension installation from explicit npm, Git, and local package targets.
- Materialize dependencies through the package manager, then reuse the common package-entry, root-collection, exact-selection, complete-registry validation, and atomic-activation seams.
- Persist generic source and resolved provenance without introducing Catalog-shaped provenance into core installation state.
- Add deterministic CLI commands to install, list, update, and uninstall directly installed Extensions.
- Keep startup offline and updates explicit. Resolve npm ranges, Git refs, and mutable local inputs only during an install or update, then retain an immutable validated materialization for execution.
- Treat the explicit install command as the operator's trust decision for in-process Extension code. Validation remains a separate correctness gate and is not a sandbox.
- Guard uninstall when configured Sources depend on the selected Extension; forced removal preserves materialized data and leaves affected Sources unavailable.
- Keep Catalog discovery and Catalog installation available, but do not require a Catalog or a published npm package.

## Capabilities

### New Capabilities

- `extension-installation`: Persistent direct package acquisition, provenance, trust, lifecycle, and atomic install/update/uninstall behavior.

### Modified Capabilities

- `extension-loading`: Directly installed packages use the common source-neutral package boundary and load offline from immutable materializations.
- `cli-surface`: The Extension command surface gains deterministic direct install, inventory, update, and uninstall commands.
- `error-taxonomy`: Direct-install invalid usage, trust, acquisition, validation, conflict, and removal-guard failures map to stable public errors and exits.

## Impact

- Affects the CLI Extension command group and Core Extension loading/registry composition.
- Adds managed installation metadata and package materializations under ctxindex-owned state/cache roots; no provider data or secrets are stored there.
- Invokes Bun package-management facilities only during explicit install/update operations and may perform npm, Git, or local filesystem acquisition then.
- Executes trusted third-party Extension modules in-process after acquisition; the CLI must state this trust boundary before users automate installation.
- Depends on the `redesign-extension-sdk` manifest-entry, collector, exact-selection, and complete-registry seams.
