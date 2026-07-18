# ctxindex System Reference

> **NON-NORMATIVE — READABLE PROJECTION**
>
> This document is an agent-authored, human-readable projection of ctxindex.
> It does not define behavior. If it conflicts with a canonical capability spec,
> `openspec/specs/<capability>/spec.md` wins.

**Last refreshed:** 2026-07-18

**Sources consulted for this refresh:**

- `CONTEXT.md`, for canonical domain language and relationships.
- All 18 canonical capability specs under `openspec/specs/*/spec.md`, listed in the Source Index.
- The 17 capability `implementation.md` sidecars present at refresh time, listed in the Source Index. No `core-model/implementation.md` sidecar was present or required.
- The active `make-concurrent-remote-search-cache-writes-safe` delta specs and implementation artifact for the implemented concurrent cache-write contract.
- `docs/design/2026-07-13-context-access-layer.md`, for accepted cross-cutting rationale. Normative claims below come from capability specs, not from the design note.

Implementation sidecars describe intended TypeScript surfaces and inter-module seams. They are selective and non-normative. Historical milestone documents are not treated as the timeless system contract.

## 1. Overview and value proposition

ctxindex is a local personal-context gateway for people and the agents acting on their behalf. It gives them one coherent way to discover, retrieve, locally materialize, and perform typed Actions on context spread across external services and local files.

The product is broader than a local search index. Local indexing is one strategy for fast discovery, but a Source can also search a provider remotely, retrieve one Resource on demand, download an Artifact, or execute a declared Action. The same Resource and Ref model applies whether context came from a sync run, remote search, or ad-hoc retrieval.

External services and the filesystem remain canonical. ctxindex stores a local mirror, index, and cache; it does not take ownership of the original records. Materialized content can therefore be rebuilt, purged, or re-fetched according to its retention rules.

The system provides:

- a provider-neutral Resource envelope and stable Ref grammar;
- versioned Profiles that carry domain schemas and vocabulary;
- Source Adapters for sync, remote search, retrieval, download, and typed provider Actions;
- trusted Extensions that bundle Profiles and Adapters through one public definition API;
- local full-text and typed-field search, plus optional provider-side search;
- managed, content-addressed Artifact storage;
- explicit OAuth Client, Account, Grant, Realm, and Source configuration;
- deterministic, non-interactive CLI and machine-readable output contracts;
- stable user-visible exit codes.

ctxindex is deliberately not:

- a SaaS service or remote canonical datastore;
- an agent workflow engine;
- a general provider-automation framework;
- a host for arbitrary Extension-defined CLI subcommands;
- a universal synchronization protocol for other applications.

## 2. Domain model

The vocabulary in this section follows `CONTEXT.md`. These terms are part of the shared mental model, not interchangeable labels.

### Organizing personal context

| Term | Meaning |
|---|---|
| **Personal Context** | Information and provider state available across a person's personal, company, university, and other operating contexts. |
| **Realm** | A user-defined operating context whose Sources should be searched and reasoned about together. It is not a tenant or security boundary. |
| **Source** | One configured connection to one collection through exactly one Source Adapter. It belongs to exactly one Realm and has a globally unique local label. |
| **Client** | Persisted OAuth application credentials and configuration for one provider. Its label is unique within that provider. |
| **Account** | One stable authenticated external identity within a provider. Its local label is globally unique. |
| **Grant** | The stable internal permission set and secret references through which ctxindex accesses one Account. |
| **Account Identity** | An address or provider identity used to recognize the Account owner, for example when distinguishing sent from received mail. |

A Client may authorize multiple Accounts for its provider. Each Account owns exactly one stable Grant. Reauthorization updates that Grant in place so compatible Source bindings remain valid. Multiple Sources may explicitly share the same compatible Grant, including Sources in different Realms.

There is no special `global` Realm. An unscoped search considers all Realms; an explicit Realm filter means exactly the requested Realms.

### Extending the system

| Term | Meaning |
|---|---|
| **Profile** | A versioned domain contract defining a Resource payload and the vocabulary needed to serve it. |
| **Source Adapter** | Provider-facing code that performs declared I/O for a Source. |
| **Extension** | A distributable module that bundles Profiles and Source Adapters. |
| **Capability** | An operation class, such as sync or retrieval, that an Adapter explicitly declares and implements. |
| **Action** | A typed provider-side mutation declared by a Profile and implemented by an Adapter through a specific Source. |
| **Draft** | A reversible provider-persisted proposed change, such as an email in the provider's Drafts collection. |

Profiles own domain meaning. Adapters own provider I/O. Extensions compose definitions but do not introduce a separate command surface. Core stays provider- and domain-neutral.

A message composed only in a conversation with an agent is not a Draft. It becomes a Draft only after a typed Action persists it through a mailbox Source.

### Representing context

| Term | Meaning |
|---|---|
| **Resource** | One addressable unit of context: a common envelope plus payload conforming to one primary Profile. |
| **Ref** | The stable ctxindex locator for a Resource, independent of local materialization. |
| **Relation** | A typed traversable edge to another Ref or to a declared natural key. |
| **Artifact** | Downloadable bytes associated with context, such as an attachment, original record, or rendered export. |
| **Materialization** | A local, purgeable representation produced by sync or ad-hoc retrieval. |
| **Field Index** | The typed generic projection of Profile-declared fields used for filtering and aggregation. |
| **Sync Run** | One recorded cursor-driven attempt to refresh a Source. |

Every Resource has one primary Profile and one stable Ref:

```text
ctx://<source-id>/<adapter-opaque-suffix>
```

The Adapter owns the suffix and core treats it as opaque. Provider URLs and provider identifiers are metadata, not ctxindex addressing input. Relations can remain unresolved when their target is absent, and they are traversable in both directions.

## 3. Trust boundaries and security model

### Local data boundary

ctxindex is local-first. Indexed content lives in a SQLite database under the user's home directory. The database, logs, and secrets store are user-controlled files. Secrets-related files use mode `0600`, and their parent directories use `0700` where feasible.

The reference implementation emits no telemetry, analytics, crash reports, or update pings. Known sensitive fields are redacted at the logger boundary.

SQLite and declarative configuration store typed secret references, not raw OAuth tokens, client secrets, API keys, or passphrases. The OS keychain is the default secret destination where available. An encrypted local file backend may be used when a keychain is unavailable. The runtime never silently changes to another backend when the configured backend fails.

Typed references identify their backend explicitly:

- `keychain:<service>/<account>/<key>`;
- `file:<path>#<key>`;
- `env:<VAR_NAME>` or `env://<VAR_NAME>` through the central environment loader.

Bare secret strings in configuration are rejected. Long-lived secrets are not accepted as literal process arguments.

### Network boundary

All provider traffic passes through a central egress chokepoint. The active authorization flow or Adapter narrows each operation to declaratively approved identity and provider hosts. The reference implementation does not contact an undeclared host. Adding a provider that needs a non-provider host requires a capability-spec change.

Credentials are resolved through the Source's linked Grant. They are not selected from a global active credential, the newest login, or Realm membership.

### Extension trust boundary

External Extensions are loaded in-process from explicitly configured local TypeScript or JavaScript paths. They run with full trust; V1 does not sandbox them. Only trusted Extension paths should be configured. There is no required package-registry, git, or ambient auto-discovery flow.

Extensions use public definition contracts and must not import ctxindex runtime internals. Runtime facilities such as authorized fetch, logging, secrets, schema support, and Artifact sinks arrive through host-provided contexts. Definitions are validated as a unit before activation. An invalid Extension is rejected whole.

Realms organize reasoning and search scope. They do not isolate credentials or create a security boundary. Account and Grant bindings enforce provider access.

## 4. Extension architecture

### Profiles are the domain layer

A Profile is a plain, versioned, schema-backed definition created through `defineProfile`. Its minimum identity is an id, integer version, and payload schema. It may also declare:

- pure search extractors for title, time, and full-text chunks;
- typed fields for filtering and aggregation;
- Relation extractors;
- Artifact descriptors;
- export formats and renderers;
- typed Action contracts;
- aliases, summaries, examples, and other agent-facing documentation.

Ordinary vocabulary functions are pure over validated payloads and perform no I/O. Export renderers are the limited exception: core may supply declared, already-resolved dependencies. Unknown vocabulary slots are ignored with a diagnostic. An unknown Profile version does not abort sync; core accepts the envelope, indexes what it can, and warns about degraded behavior.

Bundled canonical Profiles and external Profiles use the same API. Core does not add mail-, calendar-, task-, or file-specific branches.

### Source Adapters are the I/O layer

An Adapter definition is created through `defineAdapter`. It declares its provider-facing configuration, authentication contract, supported Profiles, and capabilities. The boolean operation capabilities are:

- `sync` — emit cursor-driven normalized upserts, tombstones, warnings, and cursor operations;
- `search-remote` — translate a normalized query to provider search and return envelope-level Resources;
- `retrieve` — fetch one complete Resource by Ref;
- `download` — stream Artifact bytes into the managed store.

Action implementations are keyed by Profile Action id. Declaring a capability requires implementing it; omitting it forbids it. An Adapter cannot implement an Action that none of its supported Profiles declares. Registry construction rejects mismatches before the definitions become active.

Search routing mode is not itself a capability. It is a planning choice made from command overrides, Source configuration, Adapter policy, and local coverage.

### Extensions compose definitions

An Extension is created through `defineExtension` and bundles Profiles and Adapters. Bundled Extensions are loaded first and win id conflicts with a diagnostic, but otherwise use the public Extension contract. Binding is by `(id, version)`, never JavaScript object identity.

Removing or failing to load an Extension does not delete materialized data. Its Sources remain listed as unavailable, cannot sync or perform remote operations, and retain locally searchable Resources. When vocabulary is missing, behavior degrades to the Resource envelope. Only explicit Source removal or purge paths delete data.

The external tenders Extension is the proof that a module outside the compiled binary can use the same public seam without bundled-only hooks. The binary must continue to load explicit-path TypeScript Extensions outside the repository while pinned to Bun 1.3.14.

### Module ownership

The workspace separates public definition authoring, domain Profiles, provider Adapters, core services, and the CLI shell. Adapter-owned modules contain provider definitions, configuration, operations, helpers, and focused tests. Extension composition roots only bundle definitions.

`apps/cli` parses arguments, invokes core services, formats results, maps typed errors, and returns exit codes. It does not own SQL, schema identifiers, provider HTTP, OAuth state machinery, or identity generation. Those concerns stay in core or Adapter modules behind declared seams.

## 5. Accounts, Clients, Grants, and Realms

### OAuth Clients

A Client is an explicit provider-scoped OAuth application record. `client add <provider>` accepts only provider ids declared by loaded Adapter authentication metadata. With `--from-env`, credentials come from the provider's declared environment variable names and are immediately persisted as typed secret references. Runtime authorization and refresh do not re-read them from the environment.

A Client label defaults verbatim to the provider id. It is unique within that provider, so two providers may use the same label. Collisions fail without prompting, normalization, overwriting, or automatic suffixes.

Client inventory is deterministic and non-sensitive. Removal deletes the selected provider-and-label record and its secret references. Existing Grants retain their recorded Client linkage according to the Grant contract.

### Accounts and Grants

`account add <provider>` chooses among persisted Clients for that provider only. Exactly one Client is selected automatically. No Client produces guidance to add one; multiple Clients require an exact `--client <label>`.

Authorization scopes are the sorted, deduplicated union of:

- the provider's base identity and refresh scopes; and
- operation scopes from every loaded Adapter declaring that provider.

Loading fewer Extensions is the V1 mechanism for asking for narrower consent. There is no per-authorization Adapter selection.

A provider must return a stable, non-empty external identity. Accounts are deduplicated by `(provider, external_user_id)`, not by email address. An Account label defaults verbatim to the verified provider identity and is globally unique across providers. Reauthorizing the same external identity updates the existing Account and its one Grant in place; it may also rename the Account.

A Grant stores normalized scopes and typed token references for exactly one Account and provider. A Source may bind only a provider-compatible Grant containing every scope required by its Adapter. `--account` resolution is exact and ordered: Account label, Account id, then Grant id, limited to the Adapter's provider. There is no fallback to a recent or globally active Grant.

Provider reads reuse an unexpired access token and refresh when needed. A read receiving `401` may perform one refresh retry. Actions are never retried automatically.

Account inventory includes safe Account, Grant, expiry, Source, Adapter, and Realm information without exposing secret values or the stable external identity when a safer label exists. Removing an Account deletes its Grant and secret references but preserves its Sources with cleared bindings and `needs_auth` status. Re-adding the external identity creates a fresh Grant and does not automatically rebind those Sources.

### Realms and Sources

Every Source belongs to exactly one explicitly selected, existing, user-created Realm. Source creation without a Realm fails. A Realm may mix providers, Accounts, and Adapter types. Explicit Realm filtering is exact; omitted filtering means all Realms.

Each Source represents one collection:

- one mailbox;
- one specific calendar;
- one local root directory;
- or another Adapter-defined collection of equivalent granularity.

A Source label is globally unique. Its default is `<account-label>-<adapter-tail>`, or `<adapter-tail>` for an Adapter requiring no Account. Labels remain verbatim and are not auto-suffixed. Commands accepting a Source id also accept an exact Source label.

Sync can be disabled per Source without disabling its independently supported remote search, retrieval, download, or Actions.

## 6. Search and sync behavior

### One search contract

Search uses one normalized query, typed filter grammar, Resource envelope, and deterministic JSON shape across local and provider origins. Local full-text search over Resource and chunk content is the mandatory baseline. Field names and value parsing come from loaded Profile declarations.

A query string is optional when at least one filter is supplied, including Realm, Adapter, Source, kind, field, or time filters. Bare `search` with neither text nor filters is invalid usage. A filter-only search is local enumeration: it does not call provider search. It orders Resources by `occurredAt` descending, NULL times last, then Ref ascending.

Local executions support deterministic `--limit` and `--offset` pagination and return `offset`, `limit`, and `hasMore`. Offset is valid for filter-only search and queryful `--local-only` search. It is invalid with `--remote` or a queryful mixed-routing search.

### Routing by Source coverage

Adapters may follow three coverage patterns:

- **indexed** — searchable content is replicated locally; local directories use this pattern;
- **federated** — search uses the provider API and normalizes envelope-level hits;
- **hybrid** — a bounded local hot window is indexed and older or uncovered context can be searched remotely.

Routing precedence is:

1. `--local-only` or `--remote`;
2. per-Source configuration;
3. the Adapter's routing decision, which should consider sync coverage.

Indexed Sources and covered hybrid windows use local search. Federated Sources and uncovered hybrid queries use `search-remote`. A query-less `--remote` request is invalid because V1 does not define remote enumeration or remote pagination.

Results are ranked within each origin and then interleaved. Raw local BM25 and provider relevance scores are not compared numerically. Explain output identifies the origin of each result. A provider timeout or failure preserves successful local results and adds a per-origin warning. Offline operation therefore keeps indexed content and hybrid hot windows searchable while federated origins degrade.

Verified hits from one remote origin are Ref-deduplicated and offered to local storage as one atomic cache batch. If that optional batch cannot acquire SQLite within the configured contention bound, the provider hits are still returned successfully with one `storage_busy` warning for the origin. Remote execution yields after synchronous storage waits before its final signal check so scheduled cancellation keeps its existing outcome, and backend-specific SQLite codes or lock messages are not exposed.

Full-text search should use BM25-style ranking where available and return the best matching chunks with Resources. Vector search is optional rather than a dependency of baseline discovery. If hybrid full-text/vector ranking is implemented, the recommended default is reciprocal rank fusion with `k = 60`.

### Retrieval and ad-hoc materialization

`get <ref>` returns a complete local Resource when available. Otherwise it invokes the owning Adapter's `retrieve` capability, preserves the requested Ref, and caches the result as purgeable `adhoc` materialization. A later sync of the same Ref upgrades it to `synced`.

`thread get <ref>` combines provider conversation membership with bidirectional `parent` Relations. It renders a tree when parent edges exist and otherwise a flat date-ordered list. This is generic Relation traversal, not mail logic in core.

### Sync transactions and recovery

The system supports incremental `sync`. Adapters may also support `resync` and `diff`; those modes are recommended, not universally guaranteed. Every attempted mode creates a Sync Run containing status, times, cursor information, counts, and an error summary. Current Source state and historical runs are separate records.

Adapters emit typed normalized operations and never write core tables directly. Core validates and transactionally applies Resource, field, chunk, Relation, Artifact metadata, tombstone, and cursor operations. The durable cursor advances only after all associated writes commit. Safe checkpoints may be recorded during long runs, but they do not become the current cursor until successful completion.

At minimum, one global advisory lock serializes sync runs. A competing run is recorded as cancelled with `sync busy`. Startup may clear a stale lock only when its associated run is no longer marked running. Search and status readers do not take the sync lock.

Synced deletions become tombstones and stay out of ordinary search. Ad-hoc cache rows are evicted rather than tombstoned. Tombstones are hard-deleted only by an explicit purge; no automatic tombstone purge is defined.

## 7. Provider coverage and limitations

### Google Calendar

`google.calendar@1` is a bundled indexed Adapter for `calendar.event@1`. One Source selects exactly one calendar, defaulting only to Google's documented primary calendar id, and defines positive past and future coverage days. Each Source maintains an independent anchored window, cursor, manifest, and Ref namespace.

Initial sync pages the complete selected window. Incremental sync uses the stored sync token and includes deletions. An invalid token triggers a bounded full reconciliation; missing Resources are tombstoned only after a complete successful scan.

The Adapter normalizes timed and all-day values, recurrence, organizer, attendees, status, safe text, and update times. Unsupported Google variants such as `fromGmail` and `workingLocation` remain intentionally unindexed with bounded warnings. Calendar access is read-only and requests no write Action or write scope.

### Microsoft Graph

The Microsoft OAuth provider supports approved Outlook.com personal and Microsoft 365 organizational Accounts. Stable Account identity comes from Graph `/v1.0/me` `id`, not email suffixes or the pairwise OIDC subject.

`microsoft.mailbox@1` provides federated discovery, complete retrieval, conversation Relations, attachment download, exports, and reversible Draft create/update through `communication.message@1`. Graph message and Draft requests opt into immutable provider ids so Refs stay stable within the Source. File attachments are lazy Artifact descriptors; unsupported attachment kinds are represented safely or warned about.

`microsoft.calendar@1` is an indexed, read-only Adapter for one selected calendar and rolling coverage window. The default calendar uses Graph's stable `calendarView/delta` route. An explicitly named calendar uses a complete paged stable-v1.0 window scan and manifest reconciliation, not the beta per-calendar delta route. It normalizes IANA and mapped Windows time zones, all-day dates, recurrence, and explicit null optionals. Unresolvable series-start zones produce a stable warning rather than malformed output.

Microsoft calendar has no mutation Action or write scope. Microsoft mailbox binds only Draft create and update, requests delegated `Mail.ReadWrite`, and does not request `Mail.Send`.

### Google mailbox

The capability set requires `google.mailbox` to participate in the shared search, Resource, Ref, and Draft Action contracts. It must bind the same two provider-neutral Draft Actions as Microsoft mailbox and must not expose sending.

There is currently no dedicated `google-mailbox-adapter` capability spec among the 18 canonical capabilities. This projection therefore does not claim provider-specific Google mailbox paging, retrieval, attachment, or request-shaping details beyond the cross-cutting contracts.

### Local directories and external Extensions

A local directory Source represents one root and is indexed locally. Files should remain searchable as plain text, including common source-code files, without requiring code-aware parsing. Sources should support include/exclude globs, common noisy-directory defaults, `.gitignore` behavior, and `.ctxindexignore` negation for deliberate re-inclusion. Size and binary checks should skip unsuitable files with run warnings rather than fail the whole sync.

An explicit-path external tenders Extension proves that non-bundled domains can participate in registries and generic operations. Its presence does not grant arbitrary commands or private runtime hooks.

### Calendar semantics shared by providers

`calendar.event@1` distinguishes timed intervals from all-day half-open date ranges. Timed events retain RFC 3339 instants and an IANA time zone. All-day events retain ISO local start and exclusive end dates without invented UTC-midnight instants.

A recurring series is stored once, with exception Resources only for changed or cancelled occurrences. Ordinary occurrences are expanded at runtime over a bounded query window rather than precomputed as rows. Distinct occurrences and cross-Source copies do not collapse into one Resource. V1 calendars are read-only.

## 8. Typed Actions and Drafts

Profiles declare provider-independent Actions with:

- a stable id;
- an input schema;
- an output contract;
- an effect classification of `reversible` or `irreversible`;
- documentation and examples.

Adapters bind provider implementations to those Profile Action ids. `action describe <action-id>` derives schema, effect, documentation, and Source availability from loaded registries. `action run <action-id>` requires an explicit Source, validates the complete input before any provider I/O, checks the Adapter binding and linked Grant, and returns the declared normalized result.

V1 defines exactly two provider-persisted email mutations:

- `communication.message.draft.create`;
- `communication.message.draft.update`.

Both require an explicit mailbox Source. Google and Microsoft implement the same Profile contracts rather than provider-specific input shapes. Create persists one provider Draft and returns its normalized `communication.message` Ref. Update validates a same-Source Draft Ref, performs complete replacement of recipients, subject, and text as defined by the contract, and returns the same Ref.

A successful Action that creates or changes addressable context may be materialized locally as an `adhoc` Resource. The provider remains canonical. Mutation paths do not automatically retry after ambiguous outcomes.

Sending, calendar mutation, other irreversible provider mutation, arbitrary Extension commands, and agent workflow policy are deferred. No Adapter may bind a send Action, call a send endpoint, or request a send-only permission in this scope. An irreversible Action, if introduced by a later capability change, would require explicit non-interactive confirmation.

## 9. Storage model

### Generic persistence

All domains share generic core storage:

- Resources containing envelope fields and payload JSON;
- typed Field Index rows;
- chunks and full-text indexes;
- Relations;
- Artifact metadata;
- Realm, Source, Account, Grant, sync-state, and Sync Run bookkeeping.

There are no per-domain or Adapter-owned tables. Adapter-specific sync state lives in opaque cursors. A namespaced Extension storage API is only a possible later surface.

Searchable metadata, extracted text, optional raw provider payloads, and Artifact bytes remain separate. Raw provider retention is off by default, optional when explicitly enabled, purgeable, and never the primary search contract.

### Identity and lifecycle

Core generates internal Resource row ids. Provider ids never become core primary keys and are not exposed when a Ref is available. Opaque ctxindex-owned primary keys are 26-character, time-ordered Crockford-base32 ULIDs generated by one client-side helper. A human-slug Realm uses that slug as its id; otherwise it uses a ULID.

External identity uniqueness is scoped by Source, external kind, and external id. Mailbox Resources should retain RFC822 `Message-ID` as a first-class external reference when present. Cross-Source duplicate collapse is optional; until implemented, each Source copy remains a separate Resource. Natural-key Relations can still connect those copies.

Resource origin is either:

- `synced`, which participates in tombstones; or
- `adhoc`, which is a purgeable cache entry and is never tombstoned.

When extracted content changes, chunks and field rows should be replaced wholesale. Tombstoned Resources remain in storage and are hidden from ordinary search unless explicitly requested.

Resource batches reserve the SQLite writer before materialization, collapse repeated Refs to one final stored identity, and commit the envelopes, fields, chunks, and Relations together. A projection failure rolls back the entire batch, so concurrent readers never observe a partially materialized origin.

### Relations, Artifacts, and exports

Relations point to a Ref or a Profile-declared natural key. Unresolved and dangling Relations are valid and queryable. Resolution can occur when a matching Resource arrives or at query time. Core supports forward and reverse traversal without knowing domain semantics.

Artifact bytes live in a content-addressed managed store with media type, size, origin Ref, and retention metadata. Bytes are fetched on demand and cached; sync does not fetch every Artifact by default. `--output` copies bytes to a caller path without transferring store ownership.

V1 uses only the `cached` Artifact retention class. Cached bytes remain indefinitely until explicit `ctxindex purge artifacts`. There is no age-, quota-, or pressure-based automatic eviction. Purge removes managed bytes and cache metadata but leaves the owning Resource and its Profile-derived descriptor, allowing a later download.

Export formats come from the Resource's Profile. Validated payload JSON is always exportable even without a Profile-specific renderer. Core does not contain domain-specific conversion pipelines.

### Time, local files, and durability

Core bookkeeping timestamps are integer UTC milliseconds since the Unix epoch. RFC 3339 conversion happens at output boundaries. Profile payloads may use their schema's representation, including RFC 3339 instants or ISO local dates.

A local directory Source indexes files in place and does not copy every original into ctxindex by default. Extracted text, chunks, hashes, and indexes are rebuildable materializations of the filesystem. File identity should primarily use normalized path; content hashes support change detection. Rename detection may be absent, in which case a rename is one tombstone plus one new Resource.

The baseline backup procedure is to stop active syncs and copy the SQLite file, plus the secrets-store file when the file backend is used. Beginning with the first released V1 schema, core migrations keep released databases upgradable. Pre-V1 prototype databases have no migration guarantee.

SQLite installs a five-second busy timeout before lock-sensitive setup, then runs with WAL, foreign keys enabled, and `synchronous = NORMAL`. It is the cross-process writer coordinator; no separate lock service is involved. One core storage boundary normalizes exhausted contention during database setup, migration, and Resource writes to the actionable symbolic error `storage_busy`. Required operations use existing exit 50, with raw SQLite details retained only as an internal cause.

## 10. CLI surface and stable exit codes

The reference CLI is deterministic and non-interactive. Required input is supplied by non-secret flags, declared environment or typed-secret paths, or explicitly declared stdin. Missing input fails rather than waiting for a terminal prompt. The one permitted interactive surface is the browser opened for an explicitly requested OAuth redirect.

The command surface covers initialization, Clients, Accounts, Realms, Sources, sync, search, retrieval, Artifacts, exports, typed Actions, status, secrets, skills, and maintenance as selected by a release. The timeless specs define important command contracts but leave the exact shipped command set to release scope.

Key OAuth commands are:

```text
client add <provider> [--label <label>] --from-env
client list
client remove <provider> <label>
account add <provider> [--label <label>] [--client <label>]
account list
account remove <label>
```

Generic CLI vocabulary derives from loaded registries:

- kind ids and aliases from Profiles;
- fields and value types from Profile field declarations;
- Source options and auth providers from Adapters;
- export formats from Profile export maps;
- Action schemas and availability from Profiles plus Adapter bindings.

Concise text is the token-efficient default. Read commands should provide deterministic JSON output, and exact definition descriptions expose complete schemas. Bare registry discovery stays compact; exact-id detail is readable and structured; an explicit full snapshot preserves all definitions. Generic help points callers to discovery rather than embedding the entire loaded interface.

Unknown Realm, Client, Account, Grant, Source, or Adapter references fail fast and do not auto-create entities. Label collisions are invalid usage, name the taken label, and make no change.

Bundled agent skills are versioned with the release. The CLI should list skill names and summaries, print one skill with optional referenced docs, and show the bundled skill path. Hand-written skills teach workflows; kinds, fields, formats, Actions, and Adapter flags remain registry-derived.

### Stable exit codes

| Code | Meaning |
|---:|---|
| `0` | Success. |
| `2` | Invalid usage, including bad flag combinations and label collisions. |
| `10` | Authentication is required (`needs_auth`). |
| `20` | Provider rate limit. |
| `30` | Network failure or provider unavailable/bad response. |
| `40` | Permission denied or scope mismatch. |
| `50` | Other failure, including terminal `storage_busy`. |
| `130` | Cancelled by SIGINT. |

Adapters report typed failures such as expired or revoked auth, rate limits, network errors, provider errors, bad responses, quota, not found, permission denial, cancellation, and unknown failure. Only the sync runner maps those errors to persisted run and Source status. Non-fatal warning operations can increment error counts without aborting a run.

Optional remote-search cache contention is not terminal: it returns provider results, emits `storage_busy`, and exits 0. A required storage operation using the same symbolic error exits 50; cancellation remains exit 130.

## 11. Known limitations and deferrals

This section distinguishes explicit boundaries from missing documentation. It should not be read as a roadmap commitment.

- External services and local files remain canonical; ctxindex is not an offline authoring system for arbitrary provider state.
- External Extensions run with full trust. Sandboxing and ambient package discovery are not V1 requirements.
- Arbitrary Extension CLI commands and agent workflow policy are deferred.
- Provider mutations stop at reversible email Draft creation and update. Sending, calendar writes, RSVP, invite, and other irreversible mutations are absent.
- Calendars use bounded rolling coverage and are read-only.
- Remote filter-only enumeration and remote pagination are unsupported in V1.
- Full-text search is mandatory; vector search, embeddings, and semantic ranking are optional.
- Cross-Source duplicate collapse is optional and not assumed.
- `resync` and `diff` are recommended modes but not guaranteed for every Adapter.
- Raw provider payload retention is optional and disabled by default.
- Artifact cache eviction is manual only; V1 has no automatic quota or pressure policy.
- Local file rename detection and code-aware parsing may be absent.
- Standard recurring calendar occurrences are expanded at runtime and are not individually materialized.
- Google Calendar intentionally skips unsupported variants such as `fromGmail` and `workingLocation`.
- Microsoft non-file attachment kinds may be represented only safely or by warnings.
- No dedicated Google mailbox capability spec currently defines its provider-specific wire behavior; only cross-cutting mailbox requirements are projected here.
- The exact command set and distribution channel are release-scoped rather than fixed by the timeless overview.
- Export stability across versions depends on a release declaring a format stable; otherwise it is not a cross-version restore contract.
- Prototype databases created before the first released V1 schema have no migration guarantee.

## 12. Source index

The table maps each section to the sources it distills. Capability specs are normative; sidecars and docs are supporting references only. Sections 6, 9, and 10 also incorporate the active change sources under `openspec/changes/make-concurrent-remote-search-cache-writes-safe/`: the three delta `spec.md` files plus `implementation.md`.

| SYSTEM.md section | Canonical sources | Implementation sidecars consulted | Explanatory sources |
|---|---|---|---|
| Header and authority | `CONTEXT.md`; all capability `spec.md` files below | All sidecars named below | `docs/design/2026-07-13-context-access-layer.md` §11 |
| 1. Overview and value proposition | `openspec/specs/core-model/spec.md` | `openspec/specs/module-architecture/implementation.md` | `docs/design/2026-07-13-context-access-layer.md` §§1–2 |
| 2. Domain model | `CONTEXT.md`; `openspec/specs/core-model/spec.md`; `openspec/specs/profile-vocabulary/spec.md` | `openspec/specs/profile-vocabulary/implementation.md` | `docs/design/2026-07-13-context-access-layer.md` §3 |
| 3. Trust boundaries and security model | `openspec/specs/core-model/spec.md`; `openspec/specs/secret-backend-operations/spec.md`; `openspec/specs/realm-and-source-management/spec.md`; `openspec/specs/extension-loading/spec.md` | `openspec/specs/secret-backend-operations/implementation.md`; `openspec/specs/realm-and-source-management/implementation.md`; `openspec/specs/extension-loading/implementation.md` | `docs/design/2026-07-13-context-access-layer.md` §§8–9 |
| 4. Extension architecture | `openspec/specs/profile-vocabulary/spec.md`; `openspec/specs/extension-loading/spec.md`; `openspec/specs/module-architecture/spec.md` | `openspec/specs/profile-vocabulary/implementation.md`; `openspec/specs/extension-loading/implementation.md`; `openspec/specs/module-architecture/implementation.md` | `docs/design/2026-07-13-context-access-layer.md` §§4, 8–9 |
| 5. Accounts, Clients, Grants, and Realms | `openspec/specs/oauth-client-management/spec.md`; `openspec/specs/account-grant-management/spec.md`; `openspec/specs/realm-and-source-management/spec.md`; `openspec/specs/secret-backend-operations/spec.md` | `openspec/specs/oauth-client-management/implementation.md`; `openspec/specs/account-grant-management/implementation.md`; `openspec/specs/realm-and-source-management/implementation.md`; `openspec/specs/secret-backend-operations/implementation.md` | `docs/design/2026-07-13-context-access-layer.md` §8 |
| 6. Search and sync behavior | `openspec/specs/search-routing/spec.md`; `openspec/specs/sync-operations/spec.md`; `openspec/specs/retrieval-and-artifacts/spec.md`; `openspec/specs/generic-storage/spec.md`; `openspec/specs/error-taxonomy/spec.md` | `openspec/specs/search-routing/implementation.md`; `openspec/specs/sync-operations/implementation.md`; `openspec/specs/retrieval-and-artifacts/implementation.md`; `openspec/specs/generic-storage/implementation.md`; `openspec/specs/error-taxonomy/implementation.md` | `docs/design/2026-07-13-context-access-layer.md` §§6, 8 |
| 7. Provider coverage and limitations | `openspec/specs/calendar-context/spec.md`; `openspec/specs/google-calendar-adapter/spec.md`; `openspec/specs/microsoft-graph-adapters/spec.md`; `openspec/specs/provider-actions/spec.md`; `openspec/specs/realm-and-source-management/spec.md`; `openspec/specs/search-routing/spec.md` | `openspec/specs/calendar-context/implementation.md`; `openspec/specs/google-calendar-adapter/implementation.md`; `openspec/specs/microsoft-graph-adapters/implementation.md`; `openspec/specs/provider-actions/implementation.md`; `openspec/specs/realm-and-source-management/implementation.md`; `openspec/specs/search-routing/implementation.md` | `docs/design/2026-07-13-context-access-layer.md` §§8, 12 |
| 8. Typed Actions and Drafts | `openspec/specs/provider-actions/spec.md`; `openspec/specs/profile-vocabulary/spec.md`; `openspec/specs/extension-loading/spec.md`; `openspec/specs/microsoft-graph-adapters/spec.md` | `openspec/specs/provider-actions/implementation.md`; `openspec/specs/profile-vocabulary/implementation.md`; `openspec/specs/extension-loading/implementation.md`; `openspec/specs/microsoft-graph-adapters/implementation.md` | `docs/design/2026-07-13-context-access-layer.md` §8 |
| 9. Storage model | `openspec/specs/generic-storage/spec.md`; `openspec/specs/core-model/spec.md`; `openspec/specs/retrieval-and-artifacts/spec.md`; `openspec/specs/sync-operations/spec.md`; `openspec/specs/calendar-context/spec.md` | `openspec/specs/generic-storage/implementation.md`; `openspec/specs/retrieval-and-artifacts/implementation.md`; `openspec/specs/sync-operations/implementation.md`; `openspec/specs/calendar-context/implementation.md` | `docs/design/2026-07-13-context-access-layer.md` §§5–7 |
| 10. CLI surface and stable exit codes | `openspec/specs/cli-surface/spec.md`; `openspec/specs/error-taxonomy/spec.md`; `openspec/specs/profile-vocabulary/spec.md`; `openspec/specs/search-routing/spec.md`; `openspec/specs/module-architecture/spec.md` | `openspec/specs/cli-surface/implementation.md`; `openspec/specs/error-taxonomy/implementation.md`; `openspec/specs/profile-vocabulary/implementation.md`; `openspec/specs/search-routing/implementation.md`; `openspec/specs/module-architecture/implementation.md` | `docs/design/2026-07-13-context-access-layer.md` §10 |
| 11. Known limitations and deferrals | `openspec/specs/core-model/spec.md`; `openspec/specs/provider-actions/spec.md`; `openspec/specs/calendar-context/spec.md`; `openspec/specs/search-routing/spec.md`; `openspec/specs/retrieval-and-artifacts/spec.md`; `openspec/specs/generic-storage/spec.md`; `openspec/specs/realm-and-source-management/spec.md`; `openspec/specs/module-architecture/spec.md` | Relevant sidecars above, used only to avoid claiming absent seams | `docs/design/2026-07-13-context-access-layer.md` §§12–13 |

### Canonical capability inventory

The complete normative capability set consulted on 2026-07-18 was:

1. `openspec/specs/account-grant-management/spec.md`
2. `openspec/specs/calendar-context/spec.md`
3. `openspec/specs/cli-surface/spec.md`
4. `openspec/specs/core-model/spec.md`
5. `openspec/specs/error-taxonomy/spec.md`
6. `openspec/specs/extension-loading/spec.md`
7. `openspec/specs/generic-storage/spec.md`
8. `openspec/specs/google-calendar-adapter/spec.md`
9. `openspec/specs/microsoft-graph-adapters/spec.md`
10. `openspec/specs/module-architecture/spec.md`
11. `openspec/specs/oauth-client-management/spec.md`
12. `openspec/specs/profile-vocabulary/spec.md`
13. `openspec/specs/provider-actions/spec.md`
14. `openspec/specs/realm-and-source-management/spec.md`
15. `openspec/specs/retrieval-and-artifacts/spec.md`
16. `openspec/specs/search-routing/spec.md`
17. `openspec/specs/secret-backend-operations/spec.md`
18. `openspec/specs/sync-operations/spec.md`
