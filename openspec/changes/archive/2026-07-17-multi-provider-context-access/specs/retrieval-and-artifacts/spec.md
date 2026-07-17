## ADDED Requirements

### Requirement: Microsoft mailbox retrieval has provider-neutral parity
`microsoft.mailbox` Resources SHALL use the existing complete Resource retrieval, generic conversation Relations, managed Artifact, cache, and Profile export contracts without Microsoft-specific core or CLI paths. Provider immutable ids MUST keep message, Draft, and attachment addressing stable within the Source.

#### Scenario: Missing Outlook message is hydrated
- **WHEN** `get` receives a valid Microsoft message Ref absent from local storage
- **THEN** the owning Adapter retrieves and caches a complete `communication.message` Resource through the generic path

#### Scenario: Outlook thread uses Relations
- **WHEN** a caller runs `thread get` for related Microsoft messages
- **THEN** generic Relation traversal returns their deterministic union without a provider-specific thread command

#### Scenario: Outlook attachment uses the managed cache
- **WHEN** a caller downloads an Outlook file attachment twice
- **THEN** the first request stores exact provider bytes in the managed Artifact store and the second performs no provider download

#### Scenario: Outlook message exports through its Profile
- **WHEN** a caller exports a normalized Outlook message as EML or JSON
- **THEN** the existing communication Profile renderer/fallback streams the representation without Microsoft conversion code in core
