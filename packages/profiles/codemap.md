# packages/profiles/

## Responsibility

Defines ctxindex's provider-neutral Profile vocabularies in the private workspace source for the separately publishable `@ctxindex/profiles` package: `calendar.event@1`, `chat.message@1`, `mail.message@1`, and `file@1`, with their schemas, draft input unions, Ref/text/reply helpers, and public types.

## Design / patterns

- `src/calendar-event.ts`, `chat-message.ts`, `mail-message.ts`, and `file.ts` implement schema-first declarative Profiles with Zod and `defineProfile`.
- `src/index.ts` is the facade; `package.json` also exposes direct subpaths for all four Profiles.
- The release build uses shared ESM chunks so root and subpath imports retain the same Profile, schema, and helper object identities.
- Profile hooks project payloads into search fields/chunks, relations, artifacts, exports, and typed Actions without provider-side effects. Mail and chat messages carry independent payloads but reuse generic conversation/parent Relation roles.
- Full symbol-level map: `packages/profiles/src/codemap.md`.

## Data & control flow

1. Adapters validate produced payloads with `calendarEventSchema`, `chatMessageSchema`, `mailMessageSchema`, or `fileSchema`.
2. Core invokes Profile search, relation, artifact, export, and Action declarations while it materializes, indexes, presents, or acts on Resources.
3. Chat messages derive compound message natural keys from Source-scoped conversation keys and provider message ids for reply resolution. Mail-message Draft schemas accept strict standalone content or strict reply content; create alone may select an ordered non-empty set of managed Artifact Refs, while results can retain ordered `managedAttachmentRefs`. Supporting Adapters use the exported mail helpers; `chunkText` produces searchable file chunks.

## Integration points

- Depends on one exact `@ctxindex/extension-sdk` version and compatible Zod; the private workspace manifest owns build, quality, test, and clean/fullclean tasks while release tooling generates the public manifest and exact archive.
- `packages/official/src/builtins.ts` exposes built-in Extension roots whose current Adapters target mail, calendar, and file Profiles. Google and Microsoft mailbox Adapters target `mail.message@1`; Google and Microsoft calendar Adapters target `calendar.event@1`; `chat.message@1` remains an authoring contract until a chat Adapter imports it.
- Google and Microsoft mailbox Adapters bind the same `mail.message.draft.create` and `mail.message.draft.update` Actions.
- The local-directory Adapter targets `file@1`.
- Core registry, resource, search, relation, artifact, export, and Action services consume Profile hooks through SDK contracts.
