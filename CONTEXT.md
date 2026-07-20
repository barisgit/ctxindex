# ctxindex

ctxindex is a local personal-context gateway through which agents discover, retrieve, materialize, and act on a person's context across external services and local files. External services and the filesystem remain canonical; ctxindex provides one coherent access model over them.

## Language

### Context organization

**Personal Context**:
Information and provider state available to a person across their personal, company, university, and other operating contexts.
_Avoid_: User data, corpus

**Realm**:
A user-defined operating context, such as `personal`, `company`, or `university`, containing Sources that should be searched and reasoned about together.
_Avoid_: Tenant, security boundary, account, global realm

**Source**:
One configured connection to one collection of context through exactly one Source Adapter, belonging to exactly one Realm and carrying a globally unique local label.
_Avoid_: Integration, connector instance, sync target

**OAuth App**:
One labeled OAuth application definition for a Provider, used to authorize Accounts. An OAuth App may be published by a trusted Extension or configured locally as bring-your-own-app state; its identity is the pair of Provider id and label.
_Avoid_: Client, Account, Grant, runtime environment configuration

**Account**:
One stable authenticated external identity within a provider, carrying a globally unique local label and usable by one or more Sources.
_Avoid_: User, Realm, Source

**Grant**:
The internal stable permission set, token references, and OAuth App configuration snapshot through which ctxindex accesses one Account; reauthorization updates it in place.
_Avoid_: Account, raw token, user-selected credential

**Account Identity**:
An address or provider identity representing the Account owner for distinctions such as sent versus received mail.
_Avoid_: Sender, contact

### Extension model

**Provider**:
A reusable definition of external-service identity, authentication, registration, base scopes, and allowed network hosts. Provider-backed Source Adapters and OAuth Apps import the exact Provider definition they use.
_Avoid_: Source Adapter, OAuth App, Account

**Profile**:
A versioned domain contract defining a Resource's shape and available vocabulary, including discovery fields, relations, artifacts, exports, and Actions.
_Avoid_: Model, table, provider schema

**Action**:
A typed provider-side mutation declared by a Profile and implemented by a Source Adapter, invoked through a specific Source.
_Avoid_: Arbitrary extension command, workflow, provider API call

**Draft**:
A reversible, provider-persisted proposed change, such as a message saved in a mailbox's Drafts collection; text composed only in an agent conversation is not yet a Draft.
_Avoid_: Suggested text, sent message

**Calendar Event**:
A provider record occupying a timed interval or an all-day date range in one calendar; a meeting is one kind of Calendar Event, not a synonym for all Calendar Events.
_Avoid_: Event, meeting

**Source Adapter**:
Code that implements declared operations such as sync, remote search, retrieval, download, and Profile Actions for a Source. A Source Adapter may import one exact Provider or be providerless.
_Avoid_: Plugin, Extension, connector

**Extension**:
A plain exported definition root that bundles Source Adapters and OAuth Apps, may explicitly include standalone Providers or Profiles, and introduces no separate command surface or authoring dependency graph. Exact imported Provider and Profile values form its transitive definition graph.
_Avoid_: Plugin, connector

**Documentation Tree**:
A bounded passive sidecar declared only by an Extension root. It contains authored Markdown and verified image assets projected separately from generated reference data; it never changes definition identity or behavior.
_Avoid_: Embedded definition metadata, trusted HTML, hosted documentation service

**Capability**:
An operation class a Source Adapter explicitly declares and implements, making the operation discoverable without provider-specific knowledge.
_Avoid_: Permission, Action

### Context records

**Resource**:
One addressable unit of context, represented by a common envelope that names one primary Profile and may carry a payload conforming to that Profile.
_Avoid_: Item, raw object, provider record

**Ref**:
The stable ctxindex locator for one Resource, independent of whether it is currently materialized locally.
_Avoid_: Provider URL, database row ID

**Relation**:
A typed, traversable edge from one Resource to another Ref or natural key.
_Avoid_: Join table, embedded provider link

**Artifact**:
A Source-scoped, Profile-derived descriptor for downloadable bytes associated with one Resource. Provider bytes are fetched and cached only on download; the descriptor remains when cached bytes are purged.
_Avoid_: Resource, arbitrary file, blob, cached byte object

**Materialization**:
A local, purgeable representation of provider context produced by ad-hoc retrieval or Sync.
_Avoid_: Ownership transfer, canonical copy

**Field Index**:
The typed, generic projection of Profile-declared Resource fields used for filtering and aggregation.
_Avoid_: Domain table, payload

**Sync Run**:
A cursor-driven attempt to refresh a Source's local materialization.
_Avoid_: Source, import

## Relationships

- A **Realm** contains zero or more **Sources**; every **Source** belongs to exactly one **Realm**.
- An unscoped query considers all **Realms**; a realm-scoped query considers exactly the requested Realms.
- An **OAuth App** authorizes zero or more **Accounts** for its **Provider**; OAuth App labels are unique per Provider.
- A **Source** uses exactly one **Source Adapter** and may use one **Account** through that Account's **Grant**; Account and Source labels are globally unique.
- One **Account** owns exactly one stable **Grant** and may back multiple **Sources**; reauthorization updates the Grant and its OAuth App snapshot in place, and multiple compatible Sources may explicitly share it.
- An **Extension** exports one or more roots. Its imported **Providers** and **Profiles** are collected transitively through **Source Adapters** and **OAuth Apps**; standalone leaves may also be listed explicitly.
- An **Extension** may own one **Documentation Tree** whose canonical Provider, Source Adapter, and versioned Profile routes bind to definitions in that Extension graph.
- A provider-backed **Source Adapter** imports exactly one **Provider**. A providerless **Source Adapter** creates no OAuth App, Account, Grant, Provider access, or Provider egress requirement.
- A **Profile** declares zero or more **Actions**; a **Source Adapter** implements the Actions it supports.
- A **Source Adapter** emits **Resources** through sync, search, retrieval, and action results; each **Resource**'s **Profile** derives **Relations** and **Artifact** descriptors from its validated payload, and the owning Adapter downloads provider bytes for an **Artifact** on demand.
- A **Resource** has one stable **Ref**, one primary **Profile**, and zero or more **Relations** and Profile-derived **Artifact** descriptors.
- A provider-persisted **Draft** is a **Resource** created or updated by an **Action**.

## Example dialogue

> **Dev:** "Should a search for company mail also include personal Gmail?"
> **Domain expert:** "Only when no **Realm** filter was requested. `--realm company` means exactly the company **Realm**; there is no implicit global realm."

> **Dev:** "The agent wrote an email in chat. Is that a **Draft**?"
> **Domain expert:** "Not yet. It becomes a **Draft** when ctxindex invokes a typed Action through the chosen mailbox **Source** and persists it with the provider."

> **Dev:** "Does the Gmail **Extension** implement `search` directly?"
> **Domain expert:** "Its **Source Adapter** does. The **Extension** only bundles that adapter with the communication **Profiles** it uses."

## Flagged ambiguities

- Resolved: `plugin` is not domain language; use **Extension** for a distributable module and **Source Adapter** for provider-facing behavior.
- Resolved: all context belongs to the person, while **Realm** distinguishes operating contexts such as personal, company, and university.
- Resolved: there is no `global` Realm and no implicit realm inclusion; an omitted realm filter already means all Realms.
- Resolved: typed **Actions** are part of ctxindex, while agent workflow policy and arbitrary extension commands are not.
- Resolved: V1 provider mutations are limited to reversible email **Draft** creation and update; sending and other domain mutations come later.
- Resolved: **Resource** supersedes the prototype term `Item`.
- Resolved: Profile exports and optional raw provider payload retention are separate from **Artifacts**; exports are rendered or streamed, while retained raw payloads are support data.
