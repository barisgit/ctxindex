# packages/profiles/

## Responsibility

Publishes ctxindex's bundled provider-neutral vocabularies: the `communication.message@1` and `file@1` Profile definitions, schemas, Draft input schemas, and text-chunking helper.

## Design/patterns

- Schema-first declarative Profiles are implemented in `packages/profiles/src/communication-message.ts` and `packages/profiles/src/file.ts` using Zod and `defineProfile`.
- `packages/profiles/src/index.ts` is the facade; `packages/profiles/package.json` also exposes `./communication-message` and `./file` subpaths.
- Profile hooks project payloads into search fields/chunks, relations, artifacts, exports, and typed Actions while remaining provider-neutral and side-effect free.
- Full symbol-level map: `packages/profiles/src/codemap.md`.

## Data & control flow

1. Adapters produce payloads validated by `communicationMessageSchema` or `fileSchema`.
2. Core invokes Profile search, relation, artifact, and export hooks while materializing or presenting resources.
3. `communicationMessageDraftCreateInputSchema` and `communicationMessageDraftUpdateInputSchema` validate Action inputs before a supporting Adapter executes them; `chunkText` creates overlapping searchable file chunks.

## Integration points

- Depends on `@ctxindex/extension-sdk` definition helpers and Zod.
- `packages/adapters/src/builtins.ts` bundles both Profiles and binds Gmail Draft Actions to message schemas and local-directory sync to `file@1`.
- Core registry, resource, search, relation, artifact, export, and Action services consume the Profile hooks through SDK contracts.
