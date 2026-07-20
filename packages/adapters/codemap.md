# packages/adapters/

## Responsibility

Packages ctxindex's built-in integration definitions: source-scoped Extensions, reusable Provider roots, and Profile-bound Adapters—including indexed Microsoft Calendar and thread-aware Gmail/Microsoft Graph Outlook Draft handlers—from `packages/adapters/src/` as the private workspace package `@ctxindex/adapters`.

## Design/patterns

- Thin package facade: `package.json` maps the sole export `.` to `src/index.ts`, which re-exports the three built-in Extensions, individual Adapter definitions/config schemas, and reusable Google and Microsoft Provider declarations.
- Built-in authoring directories under `src/builtin-documentation/` are validated and staged by `scripts/generate-documentation.ts` into `src/generated/documentation.ts`; roots carry those portable virtual trees so compiled relocation needs no source files.
- Provider I/O is isolated behind SDK operation contracts rather than embedded in core services or Profiles.
- Detailed implementation maps: `packages/adapters/src/codemap.md` and provider maps under `packages/adapters/src/google-calendar/`, `google-mailbox/`, `local-directory/`, and `microsoft/`.

## Data & control flow

1. The CLI passes the actual `@ctxindex/adapters` module namespace to core's shared Extension-export collector; consumers may also import individual definitions or the convenience `CTXINDEX_BUILTIN_EXTENSIONS` tuple.
2. The collector selects the exported `ctxindex.google`, `ctxindex.microsoft`, and `ctxindex.local` Extension roots while ignoring unrelated namespace exports, then core validates their embedded documentation and registers their five Adapters. Each Adapter directly references its Provider (when authenticated) and Profile definition before capability-specific dispatch.
3. Adapter code translates Google, Microsoft Graph, or filesystem data into Profile-shaped resources, streamed emissions, Artifacts, warnings, checkpoints, or Action results for core to validate and persist. Microsoft calendar and mailbox operations share the provider-root Graph transport; Draft implementations consume the shared communication Action schemas, derive replies from complete local parent Resources, resolve managed attachments before provider access, preserve attachment sets on update, issue exactly one provider mutation, and return a canonical Draft Resource; no send Action is registered.

## Integration points

- Depends on `@ctxindex/core`, `@ctxindex/extension-sdk`, and `@ctxindex/profiles` plus provider/parsing libraries declared in `packages/adapters/package.json`.
- Consumed by core extension loading/registration and, transitively, CLI source, auth, search, retrieval, artifact, sync, and Action workflows.
- The package manifest owns build, lint, format, typecheck, test-lane, and clean/fullclean tasks dispatched by root Turbo commands.
