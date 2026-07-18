## Why

ctxindex can load trusted Extension code only from explicit local paths, so users cannot install reusable Extensions from shared repositories with reproducible provenance. Commit-pinned Git Catalogs provide a bounded distribution mechanism before daemon work while preserving the existing offline startup and explicit-trust model.

## What Changes

- Add explicitly trusted Catalog registration and refresh from credential-free public HTTPS or absolute local Git repositories, pinning a full ref or object ID to an immutable commit snapshot.
- Add a strict schema-version-1 `ctxindex-catalog.json` manifest for inline Extension source and optional prose setup guidance, with deterministic bounds and path containment checks.
- Persist Catalog and installed Extension provenance as strict TOML records and activate installed Catalog Extensions through the existing validated Extension loader.
- Add deterministic Catalog add/list/show/refresh/remove and Extension install/uninstall CLI commands with separate repository and execution trust acknowledgements.
- Keep startup, listing, showing, install, uninstall, and Extension loading offline; only explicit Catalog add and refresh may access a remote repository.
- Reject authentication-bearing repositories, unsafe destinations and Git behavior, cross-repository entries, package/build hooks, and Catalog-declared provider authority.

## Capabilities

### New Capabilities

- `extension-catalogs`: Trusted Git repository registration, immutable snapshots, strict manifests, installed provenance, refresh/removal behavior, and offline/security boundaries.

### Modified Capabilities

- `extension-loading`: Load installed Catalog provenance through the existing validation seam and report provenance and degraded snapshot diagnostics without fetching.
- `cli-surface`: Expose deterministic Catalog lifecycle and install/uninstall commands with stable usage errors and JSON/text output.

## Impact

- Provider-neutral core gains a Catalog service, strict persistence schemas, safe system-Git acquisition, snapshot validation, and installed-provenance loading.
- The CLI gains argument parsing, formatting, and delegation for Catalog and install lifecycle commands.
- Existing Extension startup loading and extension-list output gain installed Catalog provenance while retaining explicit-path behavior.
- The compiled CLI relocation gate gains local-fixture Catalog coverage. No provider credentials, Accounts, Sources, Resources, or provider authority are added or mutated.
