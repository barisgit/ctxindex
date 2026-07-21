## Capability Implementation Targets

- `profile-vocabulary` → `openspec/specs/profile-vocabulary/implementation.md`
- `provider-actions` → `openspec/specs/provider-actions/implementation.md`
- `microsoft-graph-adapters` → `openspec/specs/microsoft-graph-adapters/implementation.md`
- `core-model` → `openspec/specs/core-model/implementation.md`
- `retrieval-and-artifacts` → `openspec/specs/retrieval-and-artifacts/implementation.md`

## Module Ownership

`@ctxindex/profiles` owns the `mail.message` schema, schema-derived payload type, pure email vocabulary, reply helpers, EML renderer, and Draft Action declarations. The mailbox modules in the official adapters package import those exact Profile values and own Google or Microsoft provider normalization, retrieval, download, and Draft I/O. Core consumes only the generic `ProfileReference`, Resource, Relation, Artifact, and Action-binding contracts; it must not import or branch on the mail Profile. The CLI and generated documentation consume registry descriptions instead of declaring message vocabulary independently.

## Interfaces and Data Flow

The profiles package exports `MailMessage`, `mailMessageSchema`, `mailMessageProfile`, `mailMessageDraftAttachmentSchema`, `mailMessageDraftCreateInputSchema`, `mailMessageDraftUpdateInputSchema`, and the three `deriveMailMessageReply*` helpers from both its root and `@ctxindex/profiles/mail-message`. The Profile reference is `{ id: 'mail.message', version: 1 }`; its two Action ids and outputs use the same `mail.message` prefix and reference.

Google and Microsoft normalization produce `SyncedResource` or `RetrievedResource` values carrying that exact Profile reference. Their Adapter definitions list the exact imported Profile and bind the exact renamed Action schema values. Search, sync, get, download, export, and Action results continue through the existing generic operation contracts. `conversation` and `parent` Relation extractors keep their field-based targets, allowing the core thread service to traverse relation-store results without Profile knowledge.

Provider DTOs and provider-specific helper names remain provider-owned. Only identifiers and symbols whose meaning is the canonical email Profile change from communication-oriented to mail-oriented vocabulary.

## Storage and State

No new state owner or lifecycle is introduced. Materialized Resources record the renamed Profile reference, field index rows keep the same extracted names and values, Relation rows keep the same generic relation types and targets, and Artifact descriptors/cache behavior remain unchanged. Because there is no released compatibility obligation, no storage migration or dual-read path is added.

## Security and Compatibility

The rename does not alter OAuth scopes, allowed hosts, provider endpoints, mutation count, header validation, managed attachment limits, or the prohibition on send behavior. Runtime registry validation continues to reject unknown or mismatched Profile/Action bindings. The old Profile id, Action ids, subpath, symbols, and aliases are absent rather than deprecated.

## Verification

Profile tests must prove the exact Profile and Action identities, schema inference, fields, Relations, Artifacts, EML rendering, and absence of legacy aliases. Google and Microsoft tests must prove emitted/bound references use `mail.message` across search, sync, retrieval, Draft, and compiled workflows. Core thread tests must continue to pass unchanged in behavior. Registry and CLI tests must prove generated describe/search/export/Action vocabulary uses the renamed ids. A repository verifier scans current-facing source, specifications, sidecars, docs, examples, fixtures, tests, and codemaps for stale `communication.message` vocabulary while excluding explicit historical archives and completed milestone records. Focused package tests, typecheck/lint/build, compiled e2e workflows, strict OpenSpec validation, and codemap parity are the cross-cutting gates.

## Promotion Notes

- `openspec/specs/profile-vocabulary/implementation.md`: replace the communication-oriented public interface listing with the exact `MailMessage`, `mailMessage*`, and `deriveMailMessageReply*` exports and state the `mail-message` subpath.
- `openspec/specs/provider-actions/implementation.md`: update the Google and Microsoft Draft schema-inferred types to the `mailMessageDraft*` schemas and record that adapters bind `mail.message.draft.*` without compatibility bindings.
- `openspec/specs/microsoft-graph-adapters/implementation.md`: update Draft schema references and state that mailbox normalization emits `mail.message@1` while generic Resource/Relation/Artifact flows remain unchanged.
- `openspec/specs/core-model/implementation.md`: record that thread traversal is driven only by stored `conversation` and `parent` Relations and does not branch on Profile id.
- `openspec/specs/retrieval-and-artifacts/implementation.md`: record that mailbox retrieval/export consumes generic Profile references and Profile-owned renderers with no mail-specific core path.
