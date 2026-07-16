# scripts/spikes/d3-compiled-extension/dependency/

## Responsibility

Defines the package boundary for the spike's third-party-style runtime dependency, used to prove that a compiled external Extension can resolve a bundled package dependency.

## Design

`package.json` declares the ESM package `spike-dep` at version `1.0.0` and exposes a single public entry point, `./index.js`, through the package `exports` field.

## Flow

The spike toolchain resolves the bare `spike-dep` specifier through this manifest, loads the exported runtime entry point, and supplies its exported `suffix` value to the external Extension's probe expression.

## Integration

- Consumed by `scripts/spikes/d3-compiled-extension/external/extension.ts` via `import { suffix } from 'spike-dep'`.
- The public runtime boundary is `scripts/spikes/d3-compiled-extension/dependency/index.js`, selected by `package.json#exports`.
- Participates in the parent D3 compiled-extension spike's dependency-resolution and bundling path.
