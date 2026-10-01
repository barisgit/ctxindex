## Capability Implementation Targets

- `extension-loading` → `openspec/specs/extension-loading/implementation.md`

## Module Ownership

The external example owns its authored Profile, Adapter, Extension root, synthetic fixtures, package metadata, generated runnable entry, and passive documentation. It depends inward on the public `@ctxindex/extension-sdk` authoring contract. Provider-neutral core continues to own manifest entry containment, import, structural collection, exact Extension selection, documentation resolution, complete-registry validation, and installed materialization loading. The CLI remains a generic caller of existing Extension lifecycle, Source, Sync, search, and retrieval services.

The demo package advertises its generated entry through ordinary package metadata. That declaration does not make the demo built-in and must not bypass the common loader.

## Interfaces and Data Flow

The authored entry exports the same plain `defineProfile`, `defineAdapter`, and `defineExtension` values used by every external Extension. The generated package entry must preserve those structural values while eliminating runtime dependence on unpublished workspace packages. Its Extension id remains the exact selector used by the generic installer.

Sync iterates immutable in-package fixture values and emits complete Resource upserts followed by one deterministic checkpoint. Search title, chunks, occurrence time, and typed fields are derived only through the Profile. All discovery and `get` behavior continues through existing generic orchestration and storage seams; the Adapter implements only Sync and receives no custom CLI surface.

The documentation descriptor remains relative to the definition module. Package entry import binds and validates that tree through the shared documentation resolver before registry activation.

## Storage and State

The generic direct installer owns the immutable managed package materialization and its provenance record. The demo owns no additional durable state. Realm, Source, Sync run, Resource, field-index, and checkpoint state retain their existing provider-neutral ownership and isolated `CTXINDEX_*_HOME` lifecycle.

## Security and Compatibility

The Adapter has no Provider, OAuth App, Account, secrets, Actions, or provider egress. Its injected fetch effect is unused and tests fail if it is called. Every fixture and captured output artifact must be synthetic and contain no private provider data.

Package installation remains an explicit execution-trust grant. The generated entry changes packaging only; it must not alter credential sanitization, package-manager policy, immutable provenance, managed publication, or startup replay. Existing example ids are pre-release-only and receive no compatibility alias.

## Verification

Focused example tests validate strict payloads, stable fixture variety, complete emissions, typed projections, zero fetch calls, package-entry discovery, documentation, and generated-entry freshness. A relocated compiled CLI gate proves the full generic workflow. A packed-artifact smoke serves the exact tarball from an isolated loopback npm registry and proves install, exact selection, Sync, search, and `get` without project imports or unpublished runtime dependencies; public npm publication and anonymous acquisition remain a Human checkpoint.

Repository typecheck, lint, tests, compiled Extension e2e, full CI, and strict OpenSpec validation remain cross-cutting gates.

## Promotion Notes

Merge into `openspec/specs/extension-loading/implementation.md` the doctrine that the official providerless demo remains an external plain-value Extension, that its package may advertise a checked self-contained entry without making it built-in, that authored source continues to use the public SDK, and that focused verification covers generated-entry freshness plus the isolated install-to-retrieval workflow.
