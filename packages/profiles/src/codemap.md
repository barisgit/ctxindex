# packages/profiles/src/

## Responsibility

Provides ctxindex's bundled provider-neutral Profile definitions and public schemas/helpers for `calendar.event@1`, `chat.message@1`, `communication.message@1`, and `file@1`.

## Design / patterns

- Schema-first definitions: `calendarEventSchema`, `chatMessageSchema`, `communicationMessageSchema`, strict standalone/reply Draft input unions with optional ordered managed Artifact selectors on create, and `fileSchema` validate payloads before they are attached to `defineProfile` definitions.
- `calendarEventProfile` models timed and all-day events, participants, recurrence-series metadata, credential-free provider URLs, canonical source-scoped event Refs, search projections, and a series relation. `calendarEventRef` constructs canonical event Refs after validating the Source ULID and opaque event ID.
- `chatMessageProfile` models read-only chat observations with structured senders, Source-scoped conversation keys, text or attachments, sent/edited times, optional unread state, search projections, Artifacts, and generic conversation/parent Relations. `chatMessageNaturalKey` derives the compound natural key used for message fields and provider-id reply targets.
- `communicationMessageProfile` supplies search fields/chunks, attachment descriptors, conversation/parent relations, reversible draft Actions, and an EML export renderer. Reply helpers prefer Reply-To over From, normalize repeated `Re:` prefixes, and append/deduplicate RFC Message IDs.
- `fileProfile` supplies path/time/content search projections. `chunkText` produces overlapping, boundary-aware text chunks; `isNormalizedRelativeFilePath` owns the relative-path invariant.
- `index.ts` is the facade, re-exporting the public definitions, schemas, types, and helpers; the package also offers direct Profile subpath exports.

## Data & control flow

1. Adapters produce payloads that are validated against the matching Profile schema.
2. During materialization and indexing, core invokes search extractors: calendar events supply title, summary, timing, people, and typed event fields; chat messages supply text, sender, times, attachment text, and identity fields; mail messages supply subject, date, content, and mail fields; files supply path/time/content chunks and file metadata fields.
3. Chat payloads resolve replies by exact Ref or a compound conversation/message natural key. Mail payloads carry RFC threading vocabulary, yield attachment and relation descriptors, and render `message/rfc822` through `exports.eml.render`.
4. Draft inputs select a strict standalone or reply branch. Supporting Adapters resolve a parent Resource when required, derive reply metadata with the exported helpers, and return a `communication.message@1` Resource. Create alone may carry strict `{ ref }` attachment selectors; Action results record ordered `managedAttachmentRefs`, including proven empty sets, without inventing provider Artifact descriptors.

## Integration points

- Depends on `defineProfile` from `@ctxindex/extension-sdk` and Zod.
- Profile definitions are targeted by Adapters rather than listed directly in the current built-in Extension roots: Google and Microsoft mailbox Adapters target `communication.message@1`; Google and Microsoft calendar Adapters target `calendar.event@1`; local-directory targets `file@1`.
- No current Adapter targets `chat.message@1`; its definition becomes active transitively when a future Adapter imports it.
- Google and Microsoft mailbox Adapters bind the same `communication.message.draft.create` and `communication.message.draft.update` Actions.
- The local-directory Adapter targets `file@1`.
- Google and Microsoft provider modules under `packages/adapters/src/google-mailbox/` and `packages/adapters/src/microsoft/mailbox/` create and consume communication-message payloads; local-directory emits file payloads and reuses `isNormalizedRelativeFilePath` in `packages/adapters/src/local-directory/ref.ts`. Mailbox paths are payload consumers, not users of that predicate.
- Core registry, resource, search, relation, artifact, export, and Action services consume the hooks through SDK contracts.
- Exposed inside the monorepo by the private `@ctxindex/profiles` workspace package through `@ctxindex/profiles` and direct `calendar-event`, `chat-message`, `communication-message`, and `file` subpaths.
