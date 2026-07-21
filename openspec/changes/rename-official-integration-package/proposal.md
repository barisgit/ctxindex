## Why

The workspace package currently named `@ctxindex/adapters` owns more than Source Adapter implementations: it also publishes official Providers, OAuth Apps, shared transports, documentation trees, and Extension roots. Renaming that distribution boundary to `@ctxindex/official` makes the package name match its actual responsibility before any public release creates a compatibility obligation.

## What Changes

- Rename the workspace directory from `packages/adapters` to `packages/official`.
- Rename the package and all workspace consumers from `@ctxindex/adapters` to `@ctxindex/official`.
- Preserve every exported definition, stable Provider/Profile/Adapter/Extension id, runtime behavior, and security boundary.
- **Breaking:** the private pre-release workspace package specifier changes; no compatibility alias is retained.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `module-architecture`: Name the official-integration distribution boundary independently from the generic Adapter contracts owned by `@ctxindex/extension-sdk`.

## Impact

This is a structural repository-wide rename affecting workspace manifests and lock metadata, package imports, compiled fixtures, architecture verification, implementation doctrine, generated references, and codemaps. It changes no persistence, provider request, permission, CLI, definition identity, or Extension activation behavior.
