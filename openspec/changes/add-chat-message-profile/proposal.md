## Why

The bundled `communication.message@1` Profile models internet mail: its payload and vocabulary include RFC message identifiers, mail recipients, subjects, EML export, and Draft Actions. Chat messages share generic conversation and reply relationships but do not share that mail contract. A separate canonical chat Profile lets Telegram-, Slack-, and Discord-like Adapters exchange portable message semantics without emitting sparse or misleading email payloads.

## What Changes

- Add a strict, provider-neutral `chat.message@1` Profile for read-only provider observations.
- Define portable chat identity, conversation, participant, timestamps, text, attachments, unread state, search projections, and generic `conversation` and `parent` Relations.
- Export the Profile, schema, and inferred payload type from `@ctxindex/profiles` and a dedicated package subpath.
- Add no chat mutation Actions, provider Adapter, or separate conversation Resource in this change.
- Keep `communication.message@1` unchanged; this is additive and not a compatibility break.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `profile-vocabulary`: Add `chat.message@1` to the bundled canonical Profile vocabulary and define its portable semantics.

## Impact

- `@ctxindex/profiles` gains one schema-first Profile definition and public subpath export.
- Generic registry, search, field-index, Relation, and thread traversal behavior consumes the existing Profile hooks without domain-specific core changes.
- No persistence migration, provider access, network egress, authentication, Artifact download implementation, or mutation boundary changes.
