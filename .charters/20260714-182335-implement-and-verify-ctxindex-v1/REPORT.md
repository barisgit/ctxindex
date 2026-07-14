# Charter Report

## C1. Public definitions and registries drive the runtime

- Result: Passed.
- Public seam: `packages/extension-sdk/src/index.ts` defines versioned Profile, Adapter, Extension, auth, capability, operation, and Action contracts with const-generic factories and no runtime dependency on core.
- Runtime enforcement: `packages/core/src/registry/` validates definitions, `(id, version)` uniqueness, optional Action bindings, capability/operation consistency, unknown Profile versions, and atomic Extension registration.
- Derived vocabulary: `packages/core/src/registry/describe.ts` builds kinds, aliases, fields, formats, config schemas, capabilities, and Actions from loaded registries; its fake-Profile test proves the output changes without parallel declarations.
- Verification: `work/slice-1-gate.txt` records passing typecheck, lint, 181 tests, and the Bun compiled-extension regression.

## C2. Compiled ctxindex loads trusted external TypeScript Extensions

- Result: Passed.
- Loading seam: `packages/core/src/extension/loader.ts` imports configured trusted TypeScript factories, supplies the public authoring host, and activates definitions only through validated atomic registries.
- Conflict and invalidation behavior: built-ins load first; conflicting or invalid external Extensions produce path-scoped diagnostics without partial activation.
- Runtime isolation: `packages/extension-sdk/src/index.ts` declares capability-specific Sync, Search, Retrieve, Download, and Action contexts; compile-time tests prevent cross-capability access.
- Disappearance semantics: availability reconciliation requires an explicit complete built-ins list, preserves Sources and materialized rows, marks genuinely missing adapters unavailable, and recovers returning adapters to idle.
- Compiled regression: `scripts/verify/ci.sh` now runs the retained D3 check, proving Bun 1.3.14 loads external TypeScript, relative TypeScript imports, and Extension-owned dependencies after relocation.
- Verification: `work/slice-2-gate.txt` records 190 passing tests, one skipped live-provider test, typecheck, lint, focused loader/SDK checks, and D3.
