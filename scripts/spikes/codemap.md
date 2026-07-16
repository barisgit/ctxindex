# scripts/spikes/

## Responsibility

Collects isolated executable proofs used to validate risky implementation assumptions without coupling them to production packages. The current D3 proof covers externally compiled Extension loading and dependency resolution.

## Design/patterns

- Spikes are self-contained harnesses with explicit host, authored fixture, and dependency boundaries.
- `scripts/spikes/d3-compiled-extension/` separates the host adapter from the external Extension and its third-party-style dependency; see its `codemap.md` for symbols and execution details.
- Inputs and output are deliberately narrow: a command-line module path enters, and a JSON Extension object leaves.

## Data & control flow

1. The D3 harness receives an external Extension path.
2. `d3-compiled-extension/host.ts` dynamically imports the module and supplies a minimal structural host API.
3. The external factory resolves both a local helper and `spike-dep`, constructs its Adapter/Extension result, and returns it.
4. The harness writes the result as JSON, making process success and output observable to higher-level proof runners.

## Integration points

- Detailed child map: `scripts/spikes/d3-compiled-extension/codemap.md`.
- Host entry point: `scripts/spikes/d3-compiled-extension/host.ts`.
- External fixture and dependency maps: `scripts/spikes/d3-compiled-extension/external/codemap.md` and `scripts/spikes/d3-compiled-extension/dependency/codemap.md`.
- Uses Bun/ESM module loading and process exit/output as the proof boundary.
