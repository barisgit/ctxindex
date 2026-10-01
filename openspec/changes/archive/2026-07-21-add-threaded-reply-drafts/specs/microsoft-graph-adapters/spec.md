## ADDED Requirements

### Requirement: Microsoft native threaded reply Drafts
`microsoft.mailbox@1` SHALL create a reply Draft with exactly one immutable-id `POST /me/messages/{parent-id}/createReply` mutation and no preceding Graph read. The request MUST carry the derived text body, single recipient, and deterministic reply subject. The returned Draft Resource MUST use its stable immutable id and retain the exact local `replyToRef`.

Reply update SHALL validate the target Draft and immutable parent association locally, then perform exactly one immutable-id `PATCH /me/messages/{draft-id}` mutation with derived recipient, subject, and replacement text body. It MUST NOT read the Draft or parent from Graph, change `replyToRef`, retry the mutation, or invoke a send route.

#### Scenario: Graph reply create uses native operation
- **WHEN** a valid reply create runs through a Microsoft mailbox Source
- **THEN** exactly one `createReply` request creates the Draft and no generic create, read, retry, or send request occurs

#### Scenario: Graph reply update preserves native context
- **WHEN** a valid update addresses a locally complete reply Draft with the same parent Ref
- **THEN** exactly one PATCH updates its portable content while the stable Draft Ref and `replyToRef` remain unchanged
