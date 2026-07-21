## Why

The daemon is intended to own one immutable loaded Extension registry and its passive documentation projection for its lifetime. Today the CLI documentation command reloads installed Extensions directly even when the daemon is the selected runtime, so it can observe a different registry, execute Extension code outside the daemon boundary, and bypass selected-daemon failure semantics. This makes the daemon architecture internally inconsistent and makes Extension documentation unreliable for agents.

## What Changes

- Add a bounded RPC operation that exposes the daemon runtime's already-loaded passive Extension documentation projection as portable data.
- Keep bundled ctxindex product documentation embedded and resolved in the CLI process.
- In selected-daemon mode, compose bundled product documentation with the daemon-provided Extension projection; use direct Extension loading only in established direct/no-daemon mode.
- Preserve selected-daemon fail-closed behavior: a daemon transport or protocol error is returned and never triggers direct Extension loading.
- Keep documentation wire values terminal-safe and free of executable values, module URLs, source paths, or managed materialization paths.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `documentation-consumption`: Define runtime selection for Extension documentation and selected-daemon failure behavior while retaining CLI-local bundled documentation.
- `extension-documentation`: Require the passive projection to cross the daemon RPC boundary as bounded portable values when the daemon owns the loaded registry.

## Impact

The change affects the `@ctxindex/rpc` contract and application interface, `apps/daemon` runtime composition, and the CLI documentation service loader and focused tests. It adds no provider I/O, storage schema, Extension execution format, browser surface, network dependency, or user-state migration. The trust boundary narrows because daemon-selected documentation no longer causes a second CLI-side Extension import.
