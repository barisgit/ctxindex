## ADDED Requirements

### Requirement: Mailbox retrieval and Artifact contracts have deterministic cross-provider replay evidence
Automated acceptance evidence SHALL apply one shared on-demand retrieval and Artifact lifecycle to `google.mailbox` and `microsoft.mailbox` using only obviously invented provider-shaped fixtures under reserved `.test` domains and loopback provider mocks. Every phase SHALL execute in a fresh compiled CLI process against one provider-local isolated state directory.

The evidence SHALL verify a stable remote-search Ref; complete ad-hoc hydration with body, conversation and reply identities, and one safe file Artifact descriptor; byte-identical locally served retrieval without provider reads; exact first-download bytes and later output copies from the managed cache; explicit Artifact purge that preserves the owning Resource and descriptor followed by one exact provider re-fetch; deterministic EML and JSON exports without provider reads; and rejection of malformed or foreign message and Artifact Refs before provider I/O. Provider-specific replay code SHALL be limited to invented response setup, exact credential-free route inspection, and request counts.

#### Scenario: Both mailbox providers complete the shared retrieval and Artifact lifecycle
- **WHEN** the automated replay runs the shared lifecycle for Google and Microsoft mailbox Sources
- **THEN** each provider satisfies the same stable Ref, complete ad-hoc Resource, Relation identity, Artifact descriptor, exact byte, cache, purge, re-fetch, and export assertions without live authentication or provider data

#### Scenario: Invalid mailbox identities stop before provider I/O
- **WHEN** the replay supplies malformed or foreign message and Artifact Refs for either mailbox Source
- **THEN** each command fails through the existing validation and exit contracts before any provider request occurs
