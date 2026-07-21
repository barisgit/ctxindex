## Capability Implementation Targets

- `module-architecture` → `openspec/specs/module-architecture/implementation.md`

## Module Ownership

`@ctxindex/official` is the distribution boundary for ctxindex-maintained Providers, OAuth Apps, Source Adapter implementations, shared provider transports, documentation trees, and Extension roots. `@ctxindex/extension-sdk` continues to own generic Provider/Profile/OAuth App/Adapter/Extension definition factories and types; `@ctxindex/profiles` continues to own provider-neutral vocabulary; `@ctxindex/core` remains provider-neutral and consumes official roots only through the common Extension loader.

## Interfaces and Data Flow

The package root keeps its current exported values and types. Workspace consumers import the same symbols from `@ctxindex/official`; core collects the unchanged built-in module namespace and preserves bundled provenance using the new package coordinate. Stable Provider, OAuth App, Profile, Adapter, Action, and Extension ids do not change. Provider request, normalization, documentation projection, and Extension activation flows remain unchanged.

## Storage and State

No stored Resource, Source, Account, Grant, Extension, or Catalog identity changes. The package coordinate is build-time/runtime module provenance only and requires no schema or data migration.

## Security and Compatibility

Provider hosts, OAuth scopes, managed-App selection, secret handling, and network egress remain unchanged. Because the renamed workspace package is private and unpublished, no compatibility alias or deprecated export is introduced.

## Verification

Package dependency and architecture gates must discover `packages/official` and accept only `@ctxindex/official` for this boundary. A stale-reference regression check must reject the prior package coordinate and directory in current production code, manifests, fixtures, current specifications, implementation doctrine, and documentation while permitting explicitly historical archives. Package tests, typecheck/lint, common Extension activation checks, and relocated compiled Extension/daemon gates prove unchanged runtime behavior.

## Promotion Notes

- Merge the `@ctxindex/official` workspace ownership entry, unchanged import-value/data-flow contract, and structural verification doctrine into `openspec/specs/module-architecture/implementation.md` before archive.
