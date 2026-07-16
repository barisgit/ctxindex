# scripts/spikes/d3-compiled-extension/

## Responsibility

Provides an executable proof that a host can dynamically load an externally authored TypeScript Extension factory that uses local typed modules and a bare-package runtime dependency.

## Design/patterns

- `host.ts` is a minimal host harness with a structural `HostApi` capability object and an identity-preserving `defineAdapter()` factory.
- `external/` is the authored Extension fixture; its detailed contract and module composition are mapped in `scripts/spikes/d3-compiled-extension/external/codemap.md`.
- `dependency/package.json` models an ESM third-party package boundary for `spike-dep`; see `scripts/spikes/d3-compiled-extension/dependency/codemap.md`.
- Host and Extension communicate through structural typing rather than runtime-internal imports.

## Data & control flow

1. `host.ts` accepts an Extension path from `process.argv[2]`, resolves it, and loads it with dynamic `import()`.
2. The host validates the module's default export, then calls it with `{ version: 'spike-host-v1', defineAdapter }`.
3. `external/extension.ts#defineExtension()` creates `spike.adapter`, combines `typedHelper('typescript')` with `spike-dep`'s `suffix`, and returns `spike.extension`.
4. The host serializes the returned Extension object to stdout as JSON; invalid invocation or export shape throws.

## Integration points

- Command-line entry point: `scripts/spikes/d3-compiled-extension/host.ts <extension.ts>`.
- Authored modules: `external/authoring-types.ts`, `external/extension.ts`, and `external/helper.ts`.
- Package-resolution boundary: `dependency/package.json#exports`, consumed via `import { suffix } from 'spike-dep'`.
- Runtime requirements: Bun/ESM dynamic loading plus Node `path` and `url` utilities.
