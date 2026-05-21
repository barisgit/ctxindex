# ctxindex

ctxindex is a local-first personal context index for syncing searchable copies of mail, calendar events, tasks, and local files into a local database. It exists to make a person's own context searchable across many accounts and sources without becoming SaaS or a remote source of truth.

## Language

**ctxindex**:
The CLI and local data store for personal context indexing and search.
_Avoid_: Context Hub, chub

**Source**:
A configured place that ctxindex syncs from, such as one Gmail mailbox, one Microsoft calendar, one ClickUp workspace, or one local directory.
_Avoid_: Integration, connector instance

**Account**:
An authenticated identity that one or more sources may use to access an external service.
_Avoid_: User, profile

**Grant**:
A permission set and secret reference that lets ctxindex access specific capabilities for an account.
_Avoid_: Mail account, calendar account, raw token

**Account Identity**:
An address or provider identity that represents the account owner for classification such as sent versus received mail.
_Avoid_: Sender, contact

**Item**:
A normalized searchable record created from a source, such as an email, event, task, document, or file.
_Avoid_: Raw object, provider record

**Mailbox Source**:
A source that indexes one email mailbox from one account.
_Avoid_: Mail account, inbox integration

**Calendar Source**:
A source that indexes one specific calendar from one account.
_Avoid_: Calendar account, calendar universe

**Local Directory Source**:
A source that indexes files from a user-chosen directory without becoming the canonical owner of those files.
_Avoid_: File vault, document store

**Chunk**:
A searchable segment of an item's extracted content used for full-text search and future embedding search.
_Avoid_: Fragment, blob

**Item Relation**:
A typed link from one item to another item, such as a thread membership, attachment, recurrence, or task/project link.
_Avoid_: Edge, join row

**Realm**:
A user-defined search/organization scope such as personal, paxia, or uni. Each source belongs to exactly one realm. The seeded realm is `global`, and sources without an explicit realm fall into `global`. Realm is not a security boundary and does not change credential ownership.
_Avoid_: Workspace, tenant, namespace

## Relationships

- An **Account** can have zero or more **Grants**.
- An **Account** can have zero or more **Account Identities**.
- A **Grant** can authorize zero or more **Sources**.
- A **Source** belongs to exactly one **Realm**.
- A **Realm** can contain zero or more **Sources** from any provider or account.
- A **Source** belongs to exactly one source adapter and emits zero or more **Items**.
- A **Mailbox Source** represents exactly one mailbox.
- A **Calendar Source** represents exactly one calendar, not all calendars visible to an account.
- An **Item** belongs to exactly one **Source**.
- An **Item** can have zero or more **Chunks**.
- An **Item** can have zero or more **Item Relations** to other **Items**.
- A **Local Directory Source** mirrors file metadata and extracted content while the filesystem remains canonical.
- In a **Local Directory Source**, each file is one **Item** and extracted text is split into **Chunks**.

## Example dialogue

> **Dev:** "If I add two Gmail accounts, do we create two **Sources**?"
> **Domain expert:** "Yes — each mailbox is a separate **Source**, and each can use its own **Account**."

## Flagged ambiguities

- Resolved: avoid the overloaded word "plugin" in design docs. Use **Source** for configured user data, "provider module" for bundled provider code, and "source adapter" for one sync capability inside a provider module.
- Resolved: ctxindex is a local searchable mirror/index in v1; external services and the filesystem remain canonical, and file export/write-back is a later separate feature.
- Resolved: "realm" is a user organization concept for search scope, not a security boundary, not equivalent to account or provider, and not hierarchical in v1.
- Resolved: the seeded realm is `global`. Sources without an explicit realm fall into `global`. When a search filters to specific realms, `global` is implicitly included unless the caller opts out.
