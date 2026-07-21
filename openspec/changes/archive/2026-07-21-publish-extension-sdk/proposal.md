## Why

External Extension authors are already required to import ctxindex factories, types, schemas, and `z` from `@ctxindex/extension-sdk`, but that workspace is private and has no installable npm artifact. The first public CLI release makes this the primary remaining blocker to authoring a real Extension outside the monorepo.

## What Changes

- Publish a real `@ctxindex/extension-sdk@0.1.0` package rather than a name-reservation stub.
- Ship executable ESM and TypeScript declarations for the complete supported authoring surface.
- Define a minimal public manifest, stable package exports, bounded dependencies, README, license, and npm provenance.
- Add deterministic pack, safety, external install/import/typecheck, and exact-artifact verification gates.
- Extend the release workflow so independently version-bumped public workspace packages can use the same guarded artifact and trusted-publishing model without publishing private runtime workspaces.

## Capabilities

### New Capabilities

- `extension-sdk-distribution`: Own the installable public Extension SDK artifact, its supported package surface, and its release verification contract.

### Modified Capabilities

- `extension-loading`: Require the external-package compatibility gate to consume the packed public SDK shape rather than relying on a private workspace installation.

## Impact

This affects `@ctxindex/extension-sdk`, Extension package fixtures and documentation, npm packaging/release tooling, GitHub Actions release policy, and the compiled external-Extension gate. It does not publish Core, official integrations, Profiles, RPC, daemon internals, credentials, provider data, or user state.
