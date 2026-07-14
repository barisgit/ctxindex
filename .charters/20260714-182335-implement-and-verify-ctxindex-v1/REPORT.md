# Charter Report

## C1. Public definitions and registries drive the runtime

- Result: Passed.
- Public seam: `packages/extension-sdk/src/index.ts` defines versioned Profile, Adapter, Extension, auth, capability, operation, and Action contracts with const-generic factories and no runtime dependency on core.
- Runtime enforcement: `packages/core/src/registry/` validates definitions, `(id, version)` uniqueness, optional Action bindings, capability/operation consistency, unknown Profile versions, and atomic Extension registration.
- Derived vocabulary: `packages/core/src/registry/describe.ts` builds kinds, aliases, fields, formats, config schemas, capabilities, and Actions from loaded registries; its fake-Profile test proves the output changes without parallel declarations.
- Verification: `work/slice-1-gate.txt` records passing typecheck, lint, 181 tests, and the Bun compiled-extension regression.
