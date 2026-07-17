## MODIFIED Requirements

### Requirement: Proving Adapters share search behavior
The bundled `google.mailbox`, `google.calendar`, `microsoft.mailbox`, `microsoft.calendar`, and `local.directory` Adapters SHALL prove federated and indexed discovery through the same Profile, Resource, Ref, exact Realm/Source filter, ranking, warning, and result contracts. Adding these providers MUST NOT add provider-specific search commands or core planners.

#### Scenario: Gmail, Outlook, calendars, and files share the result envelope
- **WHEN** equivalent searches target configured Google and Microsoft mailbox/calendar Sources plus a local directory
- **THEN** all return Profile-backed Resources through the same generic search envelope without provider-specific CLI commands

#### Scenario: Exact work Realm excludes personal Sources
- **WHEN** personal Google Sources and work Google/Microsoft Sources exist and search requests `--realm work`
- **THEN** only Sources explicitly belonging to the work Realm are planned regardless of Account provider or label

#### Scenario: Unscoped search spans Accounts
- **WHEN** a query omits Realm and Source filters
- **THEN** every eligible configured Source across all Accounts and unauthenticated local Sources participates according to its routing declaration
