# scripts/spikes/d3-compiled-extension/external/

## Responsibility

Implements the externally authored TypeScript fixture for the D3 compiled-extension spike, proving host API typing, local module compilation, and bare-package dependency resolution.

## Design

- `authoring-types.ts` defines the minimal structural `HostApi` contract: a host `version` and generic identity-preserving `defineAdapter()` factory.
- `extension.ts` exports the default `defineExtension(api)` factory and returns the explicit `ExtensionResult` shape.
- `helper.ts` isolates a typed local runtime helper; the fixture combines this local import with the external `spike-dep` package import.

## Flow

1. The spike host loads and calls `defineExtension(api)`.
2. The factory passes `{ id: 'spike.adapter', hostVersion: api.version }` through `api.defineAdapter()`.
3. `typedHelper('typescript')` produces the local runtime probe fragment; imported `suffix` appends the dependency fragment.
4. The factory returns Extension ID `spike.extension`, the host-defined Adapter, and the combined `probe` string.

## Integration

- Receives its only host capability through `HostApi` in `authoring-types.ts`.
- Resolves `./helper.ts` as a local authored module and `spike-dep` through `scripts/spikes/d3-compiled-extension/dependency/package.json`.
- Loaded from a command-line path by the dynamic import in `scripts/spikes/d3-compiled-extension/host.ts`; the host passes `version` and `defineAdapter()` and prints the returned object as JSON.
