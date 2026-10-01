## Context

The SDK is a private source-only workspace even though every external Extension is documented against its package name. ctxindex itself is now public at `0.1.0`, the `@ctxindex` npm organization exists, and the SDK name is unclaimed. Extension authors need a real package that works from a clean project without monorepo resolution. The SDK contains executable factories plus TypeScript inference and re-exports Zod as a convenience.

## Goals / Non-Goals

**Goals:**

- Publish one honest `0.1.0` artifact with executable ESM, declarations, and the full supported root export.
- Prove the packed artifact from a clean external package under pinned Bun and TypeScript tooling.
- Make packaging deterministic, allowlisted, secret-safe, and reusable by later public ctxindex workspaces.
- Preserve separate physical SDK/Zod copy compatibility required by Extension loading.

**Non-Goals:**

- Publishing Profiles, official integrations, Core, RPC, or daemon packages.
- Adding CommonJS, Node-runtime guarantees, browser builds, new factories, or compatibility aliases.
- Publishing automatically before a human inspects and bootstraps the first scoped package.
- Redesigning the GitHub release workflow while another lane owns that simplification.

## Decisions

1. Publish real version `0.1.0`; do not publish a stub. The first public artifact establishes the supported package surface.
2. Emit one bundled ESM runtime while keeping `zod` external, plus an emitted declaration tree rooted at the same public `index` surface. Relative declaration imports use explicit `.js` specifiers so both Bundler and NodeNext TypeScript consumers can resolve the ESM package. This avoids extensionless internal-runtime import hazards without hiding precise declaration inference.
3. Pin Zod to the SDK's tested compatible major/range rather than publishing `latest`. Authors use SDK-exported `z`, and separately installed compatible Zod copies remain structurally valid.
4. Build an allowlisted staging package from workspace output, package README, and the repository MIT license. Source, tests, monorepo paths, workspace specifiers, and development scripts do not enter the archive.
5. Keep first publication manual and artifact-exact. Release workflow composition is left to the concurrent release-simplification lane; this change exposes deterministic build/pack/verify commands it can call.
6. Treat `@ctxindex/extension-sdk` as the public authoring contract. Internal packages may consume it through the workspace, but its package manifest and declarations must not expose those internals.

## Risks / Trade-offs

- [Bundling factories can obscure module boundaries] → Preserve the declaration tree and test every root export from the packed artifact.
- [Zod version skew can break inference or runtime validation] → Use a bounded compatible dependency and prove a second physical package copy in the external install gate.
- [Declarations can accidentally leak workspace paths or private types] → Pack-time scans reject workspace specifiers, checkout paths, undeclared packages, and missing declaration targets.
- [A manual first publication can diverge from CI] → Publish only the exact verified tarball and record its checksum; do not rebuild before publishing.
- [Concurrent release workflow work may conflict] → Add composable package scripts and tests without editing `release.yml` in this lane.

## Migration Plan

No persistent state changes. External examples replace placeholder SDK versions only after `0.1.0` is live. The private workspace becomes a public package without changing its import name or source API.

## Open Questions

None.
