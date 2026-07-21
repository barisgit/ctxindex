## ADDED Requirements

### Requirement: Canonical chat message vocabulary
The bundled Profile vocabulary SHALL include a strict provider-neutral `chat.message@1` Profile distinct from the mail-oriented `communication.message@1` Profile.

Each `chat.message@1` payload MUST contain a non-empty provider message id, a Source-scoped conversation natural key formatted as `<uppercase Source ULID>:chat:<non-empty opaque key>`, a sender with a non-empty stable identity and optional display name, and a sent timestamp. It MAY contain a non-empty text body, a non-empty attachment-descriptor list, an edited timestamp not earlier than the sent timestamp, an exact boolean unread value, and a reply target. A payload MUST contain text or at least one attachment. An unread boolean MUST mean the Adapter established that point-in-time state for the authenticated owner; absence MUST mean unknown or unsupported. Unknown payload and nested-object properties MUST be rejected.

The reply target MUST identify either one exact Resource Ref or one provider message id with an optional conversation key. The Profile MUST derive the same deterministic compound message natural key from conversation key and provider message id for both indexed messages and natural-key reply targets, so provider message ids need not be globally unique.

The Profile SHALL project a title, sent occurrence time, searchable chunks, and typed fields for provider message identity, compound message natural key, conversation natural key, sender identity, sent time, optional edited time, and optional unread state. It SHALL expose attachment descriptors as Artifacts. It SHALL derive a generic `conversation` Relation through the conversation natural key and a generic `parent` Relation through the exact reply Ref or compound message natural key.

The Profile MUST declare no Actions or exports in this slice. Core MUST consume its vocabulary through the existing generic Profile hooks and MUST NOT add chat-specific thread traversal.

#### Scenario: Text message projects portable vocabulary
- **WHEN** a valid chat payload contains provider and conversation identities, a structured sender, sent and edited timestamps, text, and an exact unread value
- **THEN** `chat.message@1` validates it and deterministically projects the title, occurrence time, chunks, typed fields, and conversation Relation

#### Scenario: Attachment-only message remains valid
- **WHEN** a chat payload has no text and contains at least one valid attachment descriptor
- **THEN** `chat.message@1` validates it, derives a useful fallback title and searchable attachment text, and exposes the descriptor through the Profile Artifact hook

#### Scenario: Provider reply id resolves within a conversation
- **WHEN** a chat payload replies by provider message id without an explicit conversation key
- **THEN** its `parent` Relation targets the compound natural key derived from the current payload's conversation key and the reply provider message id

#### Scenario: Exact reply Ref remains exact
- **WHEN** a chat payload supplies an exact ctxindex Ref as its reply target
- **THEN** its `parent` Relation targets that Ref without provider-id resolution

#### Scenario: Chat payload rejects email and provider-specific vocabulary
- **WHEN** a proposed `chat.message@1` payload adds an email subject/recipient field, a provider channel field, or another unknown property
- **THEN** strict validation rejects the payload

#### Scenario: Generic thread traversal needs no chat branch
- **WHEN** core traverses `conversation` and `parent` Relations extracted from chat messages
- **THEN** it uses the same relation storage and traversal primitives as any other Profile without inspecting `chat.message@1` payload fields
