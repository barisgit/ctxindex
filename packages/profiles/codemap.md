# packages/profiles/

## Responsibility

Publishes ctxindex's bundled provider-neutral vocabularies: the `calendar.event@1`, `communication.message@1`, and `file@1` Profile definitions, schemas, standalone/reply Draft input unions, Ref/text/reply helpers, and public types.

## Design/patterns

- Schema-first declarative Profiles are implemented in `packages/profiles/src/calendar-event.ts`, `communication-message.ts`, and `file.ts` using Zod and `defineProfile`.
- `packages/profiles/src/index.ts` is the facade; `packages/profiles/package.json` also exposes `./calendar-event`, `./communication-message`, and `./file` subpaths.
- Profile hooks project payloads into search fields/chunks, relations, artifacts, exports, and typed Actions while remaining provider-neutral and side-effect free; communication messages carry portable reply metadata (`references`, `replyTo`, and `replyToRef`).
- Full symbol-level map: `packages/profiles/src/codemap.md`.

## Data & control flow

1. Adapters produce payloads validated by `calendarEventSchema`, `communicationMessageSchema`, or `fileSchema`.
2. Core invokes Profile search, relation, artifact, and export hooks while materializing or presenting resources.
3. `communicationMessageDraftCreateInputSchema` and `communicationMessageDraftUpdateInputSchema` accept either strict standalone content or a strict `replyToRef` plus body, and exported helpers derive the reply recipient, normalized subject, and deduplicated RFC References before a supporting Adapter executes the Action; `chunkText` creates overlapping searchable file chunks.

## Integration points

- Depends on `@ctxindex/extension-sdk` definition helpers and Zod.
- `packages/adapters/src/builtins.ts` bundles all three Profiles: Google and Microsoft mailbox Adapters target `communication.message@1` and bind the same `communication.message.draft.create` and `communication.message.draft.update` Actions; Google and Microsoft calendar Adapters target `calendar.event@1`; the local-directory Adapter targets `file@1`.
- Core registry, resource, search, relation, artifact, export, and Action services consume the Profile hooks through SDK contracts.
