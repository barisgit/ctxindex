# packages/profiles/src/

## Responsibility

Provides ctxindex's bundled provider-neutral Profile definitions and public schemas/helpers for `calendar.event@1`, `mail.message@1`, and `file@1`.

## Design / patterns

- Schema-first definitions: `calendarEventSchema`, `mailMessageSchema`, strict standalone/reply Draft input unions with optional ordered managed Artifact selectors on create, and `fileSchema` validate payloads before they are attached to `defineProfile` definitions.
- `calendarEventProfile` models timed and all-day events, participants, recurrence-series metadata, credential-free provider URLs, canonical source-scoped event Refs, search projections, and a series relation. `calendarEventRef` constructs canonical event Refs after validating the Source ULID and opaque event ID.
- `mailMessageProfile` supplies search fields/chunks, attachment descriptors, conversation/parent relations, reversible draft Actions, and an EML export renderer. Reply helpers prefer Reply-To over From, normalize repeated `Re:` prefixes, and append/deduplicate RFC Message IDs.
- `fileProfile` supplies path/time/content search projections. `chunkText` produces overlapping, boundary-aware text chunks; `isNormalizedRelativeFilePath` owns the relative-path invariant.
- `index.ts` is the facade, re-exporting the public definitions, schemas, types, and helpers; the package also offers direct Profile subpath exports.

## Data & control flow

1. Adapters produce payloads that are validated against the matching Profile schema.
2. During materialization and indexing, core invokes search extractors: calendar events supply title, summary, timing, people, and typed event fields; messages supply subject, date, content, and message fields; files supply path/time/content chunks and file metadata fields.
3. Message payloads carry portable threading vocabulary (`rfcMessageId`, `inReplyTo`, `references`, `replyTo`, and `replyToRef`), yield attachment and relation descriptors, and render `message/rfc822` through `exports.eml.render`.
4. Draft inputs select a strict standalone or reply branch. Supporting Adapters resolve a parent Resource when required, derive reply metadata with the exported helpers, and return a `mail.message@1` Resource. Create alone may carry strict `{ ref }` attachment selectors; Action results record ordered `managedAttachmentRefs`, including proven empty sets, without inventing provider Artifact descriptors.

## Integration points

- Depends on `defineProfile` from `@ctxindex/extension-sdk` and Zod.
- Profile definitions are targeted by Adapters rather than listed directly in the current built-in Extension roots: Google and Microsoft mailbox Adapters target `mail.message@1`; Google and Microsoft calendar Adapters target `calendar.event@1`; local-directory targets `file@1`.
- Google and Microsoft mailbox Adapters bind the same `mail.message.draft.create` and `mail.message.draft.update` Actions.
- The local-directory Adapter targets `file@1`.
- Google and Microsoft provider modules under `packages/official/src/google-mailbox/` and `packages/official/src/microsoft/mailbox/` create and consume mail-message payloads; local-directory emits file payloads and reuses `isNormalizedRelativeFilePath` in `packages/official/src/local-directory/ref.ts`. Mailbox paths are payload consumers, not users of that predicate.
- Core registry, resource, search, relation, artifact, export, and Action services consume the hooks through SDK contracts.
- Exposed inside the monorepo by the private `@ctxindex/profiles` workspace package through `@ctxindex/profiles`, `@ctxindex/profiles/calendar-event`, `@ctxindex/profiles/mail-message`, and `@ctxindex/profiles/file`.
