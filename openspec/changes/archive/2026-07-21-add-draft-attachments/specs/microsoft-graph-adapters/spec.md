## ADDED Requirements

### Requirement: Microsoft attachment-bearing Draft creation and preservation
`microsoft.mailbox@1` SHALL create a standalone or native reply Draft with managed file attachments in exactly one immutable-id MIME request. The MIME content MUST contain the validated portable recipients, subject, text body, reply headers when applicable, and every selected attachment's exact cached bytes and safe descriptor metadata. The returned Draft MUST retain its stable immutable-id Ref, conversation identity for replies, and ordered managed attachment provenance.

Draft update MUST use one immutable-id PATCH that omits the attachment collection, thereby preserving every existing attachment. It MUST NOT call attachment add/delete routes, read the Draft from Graph before mutation, retry, change reply context, or call a send route.

#### Scenario: Standalone MIME create includes exact attachments
- **WHEN** valid standalone input selects one or more managed Artifacts
- **THEN** one `POST /me/messages` MIME request creates the Draft with their exact bytes and no attachment follow-up requests

#### Scenario: Native reply MIME create includes exact attachments
- **WHEN** valid reply input selects one or more managed Artifacts
- **THEN** one `createReply` MIME request creates the Draft in the expected conversation with their exact bytes

#### Scenario: PATCH preserves attachments
- **WHEN** an existing Microsoft Draft with attachments receives a valid update
- **THEN** one PATCH changes only allowed message properties and leaves the attachment collection untouched
