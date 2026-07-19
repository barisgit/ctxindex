# packages/adapters/

## Responsibility

Packages ctxindex's built-in provider integration layer, exposing production Adapter, OAuth provider, and Extension definitions—including indexed Microsoft Calendar and thread-aware Gmail/Microsoft Graph Outlook Draft handlers—from `packages/adapters/src/` as the private workspace package `@ctxindex/adapters`.

## Design/patterns

- Thin package facade: `package.json` maps the sole export `.` to `src/index.ts`, which re-exports built-in composition, individual Adapter definitions/config schemas, and reusable Google and Microsoft OAuth provider declarations.
- Provider I/O is isolated behind SDK operation contracts rather than embedded in core services or Profiles.
- Detailed implementation maps: `packages/adapters/src/codemap.md` and provider maps under `packages/adapters/src/google-calendar/`, `google-mailbox/`, `local-directory/`, and `microsoft/`.

## Data & control flow

1. A host imports `CTXINDEX_BUILTIN_EXTENSIONS` or individual definitions from `@ctxindex/adapters`.
2. Core registers the bundled Profiles and five Adapters, then invokes capability-specific operations with SDK contexts.
3. Adapter code translates Google, Microsoft Graph, or filesystem data into Profile-shaped resources, streamed emissions, Artifacts, warnings, checkpoints, or Action results for core to validate and persist. Microsoft calendar and mailbox operations share the provider-root Graph transport; Draft implementations consume the shared communication Action schemas, derive replies from complete local parent Resources, enforce immutable reply associations, issue exactly one provider mutation, and return a canonical Draft Resource; no send Action is registered.

## Integration points

- Depends on `@ctxindex/core`, `@ctxindex/extension-sdk`, and `@ctxindex/profiles` plus provider/parsing libraries declared in `packages/adapters/package.json`.
- Consumed by core extension loading/registration and, transitively, CLI source, auth, search, retrieval, artifact, sync, and Action workflows.
- The package manifest owns build, lint, format, typecheck, test-lane, and clean/fullclean tasks dispatched by root Turbo commands.
