# packages/profiles/

## Responsibility

Defines ctxindex's bundled provider-neutral Profile vocabularies in the private `@ctxindex/profiles` workspace package: `calendar.event@1`, `communication.message@1`, and `file@1`, with their schemas, draft input unions, Ref/text/reply helpers, and public types.

## Design / patterns

- `src/calendar-event.ts`, `communication-message.ts`, and `file.ts` implement schema-first declarative Profiles with Zod and `defineProfile`.
- `src/index.ts` is the facade; `package.json` also exposes `./calendar-event`, `./communication-message`, and `./file` subpaths.
- Profile hooks project payloads into search fields/chunks, relations, artifacts, exports, and typed Actions without provider-side effects. Communication messages carry portable reply and threading metadata.
- Full symbol-level map: `packages/profiles/src/codemap.md`.

## Data & control flow

1. Adapters validate produced payloads with `calendarEventSchema`, `communicationMessageSchema`, or `fileSchema`.
2. Core invokes Profile search, relation, artifact, export, and Action declarations while it materializes, indexes, presents, or acts on Resources.
3. Communication-message Draft schemas accept strict standalone content or strict reply content; create alone may select an ordered non-empty set of managed Artifact Refs, while results can retain ordered `managedAttachmentRefs`. Supporting Adapters use the exported helpers to derive reply recipient, normalized subject, and deduplicated RFC References; `chunkText` produces searchable file chunks.

## Integration points

- Depends on `@ctxindex/extension-sdk` definition helpers and Zod; its manifest owns build, quality, test, and clean/fullclean tasks dispatched by root Turbo commands.
- `packages/adapters/src/builtins.ts` exposes built-in Extension roots whose Adapters target all three Profiles: Google and Microsoft mailbox Adapters target `communication.message@1`; Google and Microsoft calendar Adapters target `calendar.event@1`; local-directory targets `file@1`.
- Google and Microsoft mailbox Adapters bind the same `communication.message.draft.create` and `communication.message.draft.update` Actions.
- The local-directory Adapter targets `file@1`.
- Core registry, resource, search, relation, artifact, export, and Action services consume Profile hooks through SDK contracts.
