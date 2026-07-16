# packages/adapters/

## Responsibility

Packages ctxindex's built-in provider integration layer, exposing production Adapter and Extension definitions from `packages/adapters/src/` as the private workspace package `@ctxindex/adapters`.

## Design/patterns

- Thin package facade: `package.json` maps the sole export `.` to `src/index.ts`, which re-exports the built-in composition root, individual Adapter definitions, and the reusable Google OAuth provider declaration.
- Provider I/O is isolated behind SDK operation contracts rather than embedded in core services or Profiles.
- Detailed implementation maps: `packages/adapters/src/codemap.md`, `packages/adapters/src/google-calendar/codemap.md`, `packages/adapters/src/google-mailbox/codemap.md`, and `packages/adapters/src/local-directory/codemap.md`.

## Data & control flow

1. A host imports `CTXINDEX_BUILTIN_EXTENSIONS` or individual definitions from `@ctxindex/adapters`.
2. Core registers the bundled Profiles and Adapters, then invokes capability-specific operations with SDK contexts.
3. Adapter code translates provider/filesystem data into Profile-shaped resources, streamed emissions, artifacts, warnings, checkpoints, or Action results for core to validate and persist.

## Integration points

- Depends on `@ctxindex/core`, `@ctxindex/extension-sdk`, and `@ctxindex/profiles` plus provider/parsing libraries declared in `packages/adapters/package.json`.
- Consumed by core extension loading/registration and, transitively, CLI source, search, retrieval, artifact, sync, and Action workflows.
- Workspace build/typecheck/lint commands compile the TypeScript source directly through the package export.
