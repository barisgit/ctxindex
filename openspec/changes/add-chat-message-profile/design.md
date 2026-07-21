## Context

`communication.message@1` is the canonical mail payload and correctly owns mail-only concepts. Chat services also expose messages, conversations, replies, senders, and attachments, but their identity and content model does not include RFC headers, mail recipients, or Drafts. Profiles own portable domain semantics, while core thread traversal already consumes generic Relation names and targets.

The Profile must be useful to future Telegram-, Slack-, and Discord-like Adapters without encoding any one provider's channel, workspace, guild, username, or message DTO.

## Goals / Non-Goals

**Goals:**

- Model one observed chat message with strict portable identity, authorship, timing, content, attachment, read-state, search, and Relation vocabulary.
- Preserve exact provider message identity while deriving an unambiguous natural key for reply resolution within a conversation.
- Keep generic `conversation` membership and `parent` reply traversal compatible with existing core behavior.
- Keep the Profile independently evolvable from mail.

**Non-Goals:**

- Sending, editing, deleting, reacting to, or otherwise mutating provider state.
- Modeling a conversation/channel as a separate Resource.
- Provider Adapter implementations, provider-specific metadata, reactions, forwards, mentions, rich blocks, or raw payload retention.
- Renaming or changing `communication.message@1`.

## Decisions

### Use a structured sender participant

`sender` is required and has an opaque stable `id` plus optional `displayName`. A single string would force Adapters to choose between stable identity and human-readable text, making filtering and display inconsistent. A small strict object preserves both without introducing provider-specific fields such as Slack workspace ids, Telegram usernames, or Discord discriminators.

The Profile does not add a general participant/contact abstraction. That would exceed the evidence available from one-message chat payloads.

### Keep raw provider identity and derive a compound natural key

Each payload requires `providerMessageId` and a Source-scoped `conversationKey` in the form `<SOURCE_ULID>:chat:<opaque>`. The namespace prevents global natural-key resolution from joining a chat conversation to mail vocabulary. Provider message ids are not reliably global: some services identify a message only within a channel or conversation. The typed `messageKey` field is therefore derived deterministically from the pair rather than accepted as duplicated payload data.

Reply targets are a strict union: either an exact ctxindex `ref`, or a provider message id with an optional conversation key (defaulting to the current message's conversation). Natural-key parent Relations use the same compound-key helper as indexed messages.

### Reuse generic Relation names, not mail schema

`conversation` targets the declared `conversationKey` field and `parent` targets an exact Ref or derived `messageKey`. These are the same generic Relation roles used by mail, so core traversal needs no chat branch. The chat Profile remains a separate definition rather than inheriting from, wrapping, or forming a union with mail.

### Keep content small and portable

`sentAt` is required; `editedAt` is optional and cannot precede it. `text` is optional so attachment-only messages are valid, but every message must contain text or at least one attachment descriptor. `unread` is optional because not every service exposes a portable per-message unread value. `true` or `false` means the Adapter established that point-in-time state for the authenticated owner; absence means unknown or unsupported.

Attachments reuse the existing Profile-level Artifact descriptor shape by contract, but the chat module owns its strict schema locally. This avoids turning a currently incidental duplicate into a new shared public schema dependency.

### Search message content and stable identities

The title is a bounded one-line projection of text, falling back to the first attachment filename and then the sender display name or id. `sentAt` is occurrence time. Chunks include text, sender identity/display, and attachment descriptor text. Typed fields expose `providerMessageId`, derived `messageKey`, `conversationKey`, `senderId`, `sentAt`, optional `editedAt`, and optional `unread`.

## Risks / Trade-offs

- [Provider-specific rich content loses structure] -> Keep raw/provider export concerns outside this canonical Profile and add portable fields only after multiple Adapters demonstrate shared semantics.
- [Compound natural keys become public filter values] -> Own one deterministic exported helper and use it for both field extraction and reply Relations.
- [Optional unread can be confused with read] -> Preserve `undefined` when a provider cannot establish the value; only exact booleans enter the field index.
- [A required sender excludes provider events without an author] -> Treat service/system events as a later distinct Profile or map a genuine provider service identity; do not weaken message authorship speculatively.

## Migration Plan

Not applicable. The new Profile and exports are additive, and no Adapter emits it in this change.

## Open Questions

None.
