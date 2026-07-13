# ctxindex

ctxindex is a local-first personal context access layer: the interface through which agents and users discover, retrieve, and locally materialize a person's context — mail, calendar events, tasks, files, and arbitrary connector domains — across many accounts and sources, without becoming SaaS or a remote source of truth. Indexing is one implementation strategy for fast local discovery, not the product definition.

## Language

**ctxindex**:
The CLI, local data store, and extension runtime for personal context access: search, retrieval, download/export, and sync.
_Avoid_: Context Hub, chub, personal context index (as the product definition)

**Ref**:
The stable locator `ctx://<source-id>/<adapter-opaque-suffix>` for one resource, valid whether or not the resource is indexed locally. The suffix is owned by the adapter and opaque to core.
_Avoid_: URI (for the provider-native link, which is envelope metadata), ID (for the internal row id)

**Resource**:
One unit of context — a message, event, task, file, tender — stored as an envelope plus validated profile payload(s). The envelope kind is the primary profile id; user-facing kind aliases are CLI-level only.
_Avoid_: Item, raw object, provider record

**Profile**:
A versioned, schema-backed declaration of a domain shape plus the vocabulary core needs to serve it: search mapping, typed fields, relations, artifacts, exports, docs. The only mechanism for domain semantics; canonical profiles are bundled profile definitions using the same public API as extension profiles.
_Avoid_: Shape, model, table

**Source Adapter**:
Code that connects one provider collection type. Declares capability flags, auth spec, config schema, and emitted profiles; implements sync/searchRemote/retrieve/download per its declared capabilities. Built-in and extension adapters use the identical contract.
_Avoid_: Plugin, connector, integration

**Extension**:
A distributable module providing profiles and adapters via `defineExtension`. Built-ins are extensions bundled with the binary; their only privileges are distributional (always present, loaded first, win id conflicts).
_Avoid_: Plugin

**Source**:
One configured connection to one collection of a user's context, accessed through exactly one source adapter — such as one Gmail mailbox, one calendar, one ClickUp workspace, one local directory, or one tenders portal. Sync is an optional per-source setting, not part of the definition; an ad hoc-only source participates in remote search and retrieval without ever syncing.
_Avoid_: Integration, connector instance, sync target (as definition)

**Account**:
An authenticated identity that one or more sources may use to access an external service.
_Avoid_: User, profile

**Grant**:
A permission set and secret reference that lets ctxindex access specific capabilities for an account.
_Avoid_: Mail account, calendar account, raw token

**Account Identity**:
An address or provider identity that represents the account owner for classification such as sent versus received mail.
_Avoid_: Sender, contact

**Artifact**:
Downloadable bytes — an attachment, an original provider record, a rendered export — held in the managed content-addressed artifact store with retention policy and purge support.
_Avoid_: File (for the store entry), blob

**Materialization**:
Bringing provider content or artifacts into local storage, either ad hoc (retrieve/download caching) or repeatedly for a configured scope (sync).
_Avoid_: Import, mirror (as verb)

**Chunk**:
A searchable segment of a resource's extracted content used for full-text search and future embedding search.
_Avoid_: Fragment, blob

**Relation**:
A typed, bidirectionally-indexed edge between resources. The target may be a ref or a natural key (a declared field/value pair) resolved lazily, so edges may legally dangle until the target arrives.
_Avoid_: Edge, join row, item relation

**Field Index**:
Generic typed index rows extracted from a profile's declared fields; powers `--field` filters, aggregation, and natural-key relation resolution.
_Avoid_: Column, projection table

**Realm**:
A user-defined search/organization scope such as personal, paxia, or uni. Each source belongs to exactly one realm. The seeded realm is `global`, and sources without an explicit realm fall into `global`. Realm is not a security boundary and does not change credential ownership.
_Avoid_: Workspace, tenant, namespace

## Relationships

- An **Extension** provides zero or more **Profiles** and zero or more **Source Adapters**.
- An **Account** can have zero or more **Grants**.
- An **Account** can have zero or more **Account Identities**.
- A **Grant** can authorize zero or more **Sources**.
- A **Source** belongs to exactly one **Realm** and uses exactly one **Source Adapter**.
- A **Source** emits zero or more **Resources**; each **Resource** belongs to exactly one **Source** and is addressed by exactly one **Ref**.
- A **Resource** has one primary **Profile** (its kind) and optionally the `artifact` profile as secondary.
- A **Resource** has zero or more **Chunks**, zero or more **Field Index** rows, zero or more **Relations**, and zero or more **Artifacts**.
- A **Relation** targets a **Ref** or a natural key; unresolved edges are legal.
- Sync and ad hoc retrieval are two **Materialization** modes over the same **Source**.

## Example dialogue

> **Dev:** "If I add two Gmail accounts, do we create two **Sources**?"
> **Domain expert:** "Yes — each mailbox is a separate **Source**, and each can use its own **Account**. One can sync while the other stays ad hoc-only."

> **Dev:** "Where does the tender shape live? Core?"
> **Domain expert:** "No. Core never knows domains. The tenders **Extension** defines a tender **Profile**; core only speaks the profile vocabulary — fields, relations, artifacts, exports."

## Flagged ambiguities

- Resolved: avoid the overloaded word "plugin". Use **Source** for configured user data, **Extension** for a distributable module, and **Source Adapter** for one connection capability.
- Resolved: ctxindex is an access layer; external services and the filesystem remain canonical. Export and ad hoc retrieval are in scope; write-back is not.
- Resolved: "realm" is a user organization concept for search scope, not a security boundary, not equivalent to account or provider, and not hierarchical.
- Resolved: the seeded realm is `global`. Sources without an explicit realm fall into `global`. When a search filters to specific realms, `global` is implicitly included unless the caller opts out.
- Resolved: **Item** is superseded by **Resource**; the envelope kind IS the primary profile id.
- Open: whether realms earn their place in the redesigned model or are ceremony to be cut (flagged in `docs/design/2026-07-13-context-access-layer.md`).