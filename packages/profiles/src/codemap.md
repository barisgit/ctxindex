# packages/profiles/src/

## Responsibility

Provides ctxindex's bundled, provider-neutral Profile definitions and their public schemas/helpers: the `calendar.event@1`, `communication.message@1`, and `file@1` vocabularies.

## Design / patterns

- Schema-first definitions: `calendarEventSchema`, `communicationMessageSchema`, strict standalone/reply Draft input unions with optional ordered managed Artifact selectors on create, and `fileSchema` use Zod before being attached to `defineProfile` definitions.
- `calendarEventProfile` normalizes timed and all-day events, participants, recurrence/series metadata, credential-free provider URLs, source-scoped canonical Refs, summary/chunk/field projections, and series relations; its `events` alias is registry-visible.
- Declarative projections: each Profile supplies search title/time/chunk/field extractors; `communicationMessageProfile` additionally declares relation resolvers, attachment descriptors, reversible Draft Actions, and an EML export renderer.
- Pure helpers: `deriveCommunicationMessageReplyRecipient` prefers the first Reply-To address over the first sender, `deriveCommunicationMessageReplySubject` collapses repeated `Re:` prefixes, and `deriveCommunicationMessageReplyReferences` appends/deduplicates the parent Message-ID; `chunkText` performs overlapping, boundary-aware text chunking; `isNormalizedRelativeFilePath` owns the file Profile's path invariant; `renderEml` and `sanitizeHeader` produce normalized RFC822-style text without external state.
- Facade exports: `packages/profiles/src/index.ts` re-exports the public definitions, schemas, `CommunicationMessage` type, reply helpers, `chunkText`, and `FileChunk` while package subpath exports permit direct Profile imports.

## Data & control flow

1. Provider payloads enter through `calendarEventSchema`, `communicationMessageSchema`, or `fileSchema` validation.
2. During materialization/indexing, core invokes each Profile's `search` extractors: calendar events expose title/summary/timing/participants and typed event fields; messages expose subject/date/content and typed message fields; files expose path/time/content chunks and typed metadata fields.
3. Message payloads can also carry portable RFC/threading vocabulary (`rfcMessageId`, `inReplyTo`, `references`, `replyTo`, and `replyToRef`), yield attachment descriptors and conversation/parent relation targets, and render `message/rfc822` output through `exports.eml.render`.
4. Draft command input is validated as either standalone fields or a reply branch containing `replyToRef` and `bodyText` (plus `ref` for updates). Create alone may carry strict `{ ref }` attachment selectors; Action results record ordered `managedAttachmentRefs`, including proven empty sets, without inventing provider Artifact descriptors.

## Integration points

- Depends on `defineProfile` from `packages/extension-sdk/src/index.ts` and Zod.
- `packages/adapters/src/builtins.ts` bundles `calendarEventProfile`, `communicationMessageProfile`, and `fileProfile` into `ctxindexBuiltinExtension`; Google and Microsoft mailbox Adapters target `communication.message@1` and bind the same `communication.message.draft.create` and `communication.message.draft.update` Actions; Google and Microsoft calendar Adapters target `calendar.event@1`; the local-directory Adapter targets `file@1`.
- Google and Microsoft provider modules under `packages/adapters/src/google-mailbox/` and `packages/adapters/src/microsoft/mailbox/` create and consume communication-message payloads; local-directory emits file payloads and reuses the exported path predicate.
- Core Profile registries and resource/search/relation/export/action services consume the declarative hooks through the SDK interfaces.
- Exported as `@ctxindex/profiles`, `@ctxindex/profiles/calendar-event`, `@ctxindex/profiles/communication-message`, and `@ctxindex/profiles/file` by `packages/profiles/package.json`.
