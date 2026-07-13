# ctxindex Specification

Status: draft

This document is the **timeless** normative specification for ctxindex behavior and extension contracts. It describes what any conforming implementation/version MUST or SHOULD do, regardless of milestone. It contains no "v1" / "v2" qualifiers.

Milestone scope (must-ship lists, deferred items, exit criteria) lives in `V1.md`, `V1_1.md`, etc. Implementation choices, TypeScript types, ORM details, file layout, and the reference CLI plan live in `IMPLEMENTATION.md`. Domain language and naming aliases live in `CONTEXT.md`.

## 1. Scope

ctxindex is a local-first personal context access layer. It is the interface through which agents and users discover, retrieve, and locally materialize user-owned context from external services and local files. Indexing searchable local copies is one implementation strategy for fast local discovery, not the product definition.

ctxindex defines:

- a resource/profile model for mail, calendar events, tasks, files, and arbitrary extension-defined domains;
- a profile vocabulary contract through which all domain semantics reach core;
- a source adapter contract with capability flags (sync, remote search, retrieval, download), used identically by bundled and extension adapters;
- an extension loading model for user-provided profiles and adapters;
- a stable ref grammar addressing resources independent of index state;
- normalized resource/chunk/tombstone operations emitted by source adapters;
- local full-text and field search over normalized content, with optional provider-side (remote) search;
- a managed content-addressed artifact store for attachments, raw records, and rendered exports;
- export of resources to portable formats declared by profiles;
- local account, grant, source, sync, and search behavior.

ctxindex does not define:

- a SaaS service or remote canonical store;
- write-back to external services as part of the core contract;
- extension-registered arbitrary CLI subcommands (deferred; see design doc D1/D18);
- a universal sync protocol for arbitrary applications.

Milestone documents (`V1.md`, etc.) MAY further restrict the runtime feature set for a given release without weakening any normative requirement in this spec.

## 2. Requirement keywords

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** are normative only when written in all capitals.

## 3. Core model

- An **extension** is a distributable module providing profiles and source adapters through the public definition API. Bundled (built-in) extensions use the same contract; their only privileges are distributional (always present, loaded first, winning id conflicts with a diagnostic).
- A **profile** is a versioned, schema-backed declaration of one domain shape plus the vocabulary core uses to serve it (§3a). Profiles are the ONLY mechanism for domain semantics; core MUST NOT contain domain-specific code paths.
- A **source adapter** is code connecting one provider collection type, such as `google.mailbox` or `local.directory`. It declares capability flags, an auth spec, a config schema, and the profiles it emits.
- An **account** is an external authenticated identity.
- A **grant** is a permission set and secret reference for an account.
- A **source** is one configured connection to one collection using exactly one source adapter. Sync is an optional per-source setting; a source with sync disabled participates in remote search and retrieval only.
- A **resource** is one unit of context emitted by a source: an envelope (ref, primary profile id+version, title, times, origin) plus validated profile payload(s). The envelope kind IS the primary profile id.
- A **ref** is the stable locator `ctx://<source-id>/<adapter-opaque-suffix>` for one resource, valid whether or not the resource is indexed. The suffix is adapter-owned and opaque to core. Provider-native URIs are envelope metadata, never addressing input.
- A **chunk** is one searchable segment of a resource's extracted content.
- An **artifact** is downloadable bytes (attachment, original record, rendered export) in the managed artifact store.

A source adapter MUST emit normalized core operations for searchable data. Adapters MUST NOT own database tables; all persistence flows through the generic core storage model (§3b). Adapter-specific state lives in the sync cursor and the artifact store.

### 3a. Profile vocabulary

A profile declares, at minimum: an id, an integer version, and a payload schema. It MAY declare vocabulary slots:

- **search mapping** — pure extractors for title, occurred-at, and FTS chunks;
- **fields** — TYPED declarations (`type` + pure extractor) that populate the generic field index and define valid `--field` filters and aggregations;
- **relations** — pure extractors producing edges to refs or natural keys (§4);
- **artifacts** — pure extractor producing artifact descriptors (bytes fetched lazily);
- **exports** — a map of format name to media type + render function;
- **docs** — human summaries, kind aliases, and examples, from which agent-facing documentation is derived.

Vocabulary rules (normative):

1. Vocabulary functions MUST be pure over the validated payload; no I/O. The one exception is export render functions, which MAY receive core-resolved declared dependencies (e.g. related resources by relation type).
2. Vocabulary slots are versioned. An implementation encountering an unknown slot MUST ignore it with a diagnostic and continue.
3. When an adapter emits a payload for an unknown profile id or version, core MUST accept the resource at envelope level, index what the envelope carries, and surface a warning (degraded acceptance). Sync MUST NOT fail on unknown profiles.
4. Bundled canonical profiles (`communication.message`, `communication.conversation`, `calendar.event`, `task`, `file`, `artifact`) MUST be expressible through the same public profile API as extension profiles.

### 3b. Storage model

All resource persistence uses generic core tables: resources (envelope + payload JSON), field index rows, chunks + FTS, relations, artifact metadata, plus the existing source/sync bookkeeping tables. Per-domain tables and per-adapter table namespaces MUST NOT exist. A namespaced per-extension storage API MAY be added later as a new surface without changing this contract.

Resources carry an origin class: `synced` (produced by sync runs, subject to tombstones) or `adhoc` (cache entries produced by retrieval or remote search; evicted, never tombstoned). Remote search hits MAY be cached envelope-only; a subsequent retrieve fills the payload. A later sync of the same ref upgrades the row to `synced`.

### 3c. Adapter capabilities and operations

An adapter declares a set of boolean capability flags: `sync`, `search-remote`, `retrieve`, `download`. Declaring a capability REQUIRES implementing its operation; omitting it FORBIDS it:

- `sync` — cursor-driven generator emitting resource upsert/tombstone/cursor operations;
- `search-remote` — translate a ctxindex query to the provider's search API, returning envelope-level results with refs;
- `retrieve` — fetch one complete resource by ref;
- `download` — stream one artifact's bytes by artifact ref into the managed store.

Search routing mode is NOT a capability. Routing precedence is: CLI flag (`--local-only` / `--remote`) over per-source configuration over adapter decision. The default is hybrid orchestration in which each source answers per its adapter's routing choice, which SHOULD consult sync coverage.

### 3d. Extensions and loading

Extensions are TS/JS modules loaded in-process by dynamic import, running with full trust (documented prominently). Definitions are plain versioned objects produced by pure factories (`defineExtension`, `defineAdapter`, `defineProfile`); binding between SDK descriptors and runtime behavior is by `(id, version)`, never object identity. Extensions MUST NOT import ctxindex runtime code; runtime values (schema library, logger, authorized fetch, secrets, artifact sink) arrive via host-provided context objects. Core MUST validate loaded definitions at runtime (schema, id uniqueness, capability/operation consistency) before activation; an invalid extension is rejected whole with a diagnostic.

When an extension is removed or fails to load, its sources become unavailable (listed; no sync; no remote operations) but their synced resources REMAIN searchable, degrading to envelope-level behavior where profile vocabulary is missing. Removing extension code MUST NOT silently delete data; explicit source removal/purge commands are the only deletion paths.

The CLI's generic verbs MUST derive their argument space from the registries: valid kinds from profile ids and declared aliases, valid `--field` names and value types from profile field declarations, adapter config flags from config schemas, export formats from profile export maps. Parallel hand-maintained command or alias declarations MUST NOT exist.

## 4. Identity, deletion, and relations

Core resource row IDs MUST be generated by ctxindex, not copied from provider IDs. The public addressing surface is the ref (§3); internal row ids MUST NOT appear in agent-facing output where a ref is available.

A resource MAY have multiple external references. External references represent provider or local identifiers such as message IDs, thread IDs, RFC822 Message-ID headers, event IDs, or file paths.

Mailbox sources SHOULD store the RFC822 `Message-ID` header as a first-class external reference when present, using an external kind such as `rfc822_message_id`.

External identity uniqueness MUST be scoped by source and external kind:

```text
source_id + external_kind + external_id
```

A local directory source SHOULD identify files primarily by normalized path within the source root. Content hashes SHOULD be used for change detection. An implementation MAY omit file rename detection, in which case a rename is represented as a tombstone for the old path and a new item for the new path.

Deletes of synced resources SHOULD be represented with tombstones rather than immediate hard deletes. Tombstoned resources MUST be excluded from normal search results by default and MAY be included with an explicit deleted/tombstoned filter.

Core MUST provide a generic relation model. A relation links one resource to a target that is either a ref or a natural key (a declared field name plus value, e.g. `internetMessageId` + RFC822 Message-ID). Natural-key edges MUST be stored unresolved when the target is absent and resolved lazily — on arrival of a matching resource (via the field index) or at query time. Dangling edges are legal and MUST be queryable as unresolved. Relations MUST be traversable in both directions; "resources related to X by relation R" is a required query primitive. Reply-tree threading (message `parent` edges from In-Reply-To/References) and thread membership (`conversation` edges) are profile-declared relations, not core mail knowledge.

When a resource's extracted content changes, an implementation SHOULD replace that resource's chunks and field-index rows wholesale. Chunk IDs MUST be generated by ctxindex. The tuple `(resource_id, chunk_index)` SHOULD be unique.

Mail and calendar attachments SHOULD become separate resources when their content is extractable, linked to the parent resource by relations. Non-extractable attachments remain artifact descriptors on the parent resource.

Searchable metadata, extracted body/chunk text, optional raw provider payloads, and artifact metadata are separated by the generic storage model (§3b): payload JSON, chunks, the artifact store, and optional raw records.

Core SHOULD track account identities for mailbox accounts so sources can classify messages as sent, received, or self-authored across Google and Microsoft accounts.

A recurring calendar event MUST be modeled as a single series resource plus stored exception resources for occurrences that differ from the series or are cancelled. Standard, unmodified recurring occurrences MUST NOT be materialized as separate resources in storage. This modeling lives in the `calendar.event` profile, not in core.

Time-window views of recurring events SHOULD be produced by runtime expansion of the series recurrence rule over a bounded query window, not by precomputed per-occurrence rows.

Cancellation of a single occurrence MUST be represented as a stored exception, not as a separate cancelled event row. Cancellation of an entire series MUST be represented by tombstoning the series resource.

## 5. Source granularity

A mailbox source MUST represent exactly one mailbox.

A calendar source MUST represent exactly one specific calendar, not every calendar visible to an account.

A local directory source MUST represent one configured root directory. Each indexed file in that directory source SHOULD map to one resource, and extracted text SHOULD map to zero or more chunks.

A local directory source SHOULD support plain text and common source-code files as text inputs at minimum. Code-aware parsing MAY be added later, but source code SHOULD remain searchable as text without specialized parsing.

A local directory source SHOULD support per-source include/exclude globs, built-in default ignores for noisy directories, and `.gitignore`-compatible ignore rules where applicable.

A local directory source SHOULD NOT expose a broad "ignore all ignore files" switch as the normal override. It SHOULD instead support an explicit ctxindex-specific ignore/allow file named `.ctxindexignore`, whose gitignore-style negation rules can intentionally re-include paths ignored by `.gitignore`.

A local directory source SHOULD enforce file size and binary detection limits by default. Skipped files SHOULD be reported in the sync run counts or error summary without failing the whole sync.

One extension MAY provide multiple source adapters, such as mailbox, calendar, and Drive. Each source still uses exactly one source adapter.

## 6. Local-first boundary

ctxindex MUST behave as a local searchable mirror/index. External services and the filesystem remain canonical.

Source adapters MUST NOT use exported files as their primary storage contract. File export MAY be offered as a separate feature.

A local directory source MUST index files in place and MUST NOT copy every original file into ctxindex by default. It MAY store extracted text, chunks, hashes, and metadata in SQLite for search. Stored extracted text, chunks, and full-text indexes SHOULD be treated as purgeable and rebuildable from the canonical filesystem source.

## 7. Secrets

ctxindex MUST store OAuth tokens, API keys, and other secrets outside SQLite by default, using the OS keychain where available.

SQLite and declarative config MUST store secret references, not raw secrets.

An encrypted local secret-store fallback MAY exist for environments without a usable OS keychain.

Secret references in declarative config (TOML or otherwise) MUST be one of the following typed URI forms:

- `keychain:<service>/<account>/<key>` — OS keychain entry.
- `file:<absolute-or-config-relative-path>#<key>` — entry inside an encrypted secrets file.
- `env:<VAR_NAME>` or `env://<VAR_NAME>` — environment variable, resolved through the central env loader (no direct `process.env` reads outside the loader). The variable name MUST match `^[A-Z_][A-Z0-9_]*$`.

A bare secret string in config (no URI scheme) MUST be rejected at config-load time with an actionable error.

## 8. Sync operations

ctxindex MUST support at least the `sync` mode and SHOULD support `resync` and `diff`:

- `sync`: incremental sync when a source cursor exists;
- `resync`: full refetch/reconcile for a source;
- `diff`: support-aware dry-run comparison of remote/local state.

An individual source adapter MAY declare which subset of these modes it supports through its capabilities.

Each execution of `sync`, `resync`, or `diff` for a source MUST create a sync run record.

A sync run MUST record at least source, mode, status, start time, completion time when known, cursor before, cursor after when committed, item counts, and error summary when failed.

Core MUST keep current source sync state separate from sync run history. Current sync state is the latest durable cursor/status used by future syncs; sync runs are the audit trail of attempts.

Core MUST support checkpoints for long-running syncs when an adapter can expose safe checkpoint state. A checkpoint MUST NOT become the source's current cursor until the run completes successfully.

Source adapters MUST NOT write core tables directly. They MUST return typed operations, and core MUST validate and apply those operations transactionally.

Adapters do not own tables (§3b). Adapter-specific sync state belongs in the cursor; blobs belong in the artifact store.

Core MUST advance sync cursors only after resource/chunk/tombstone/index writes commit successfully.

## 9. Raw provider payloads

Raw provider payload storage is OPTIONAL support data for debugging, audit, and resync diagnostics.

When enabled, raw payload retention MUST be purgeable. Raw provider payloads MUST NOT be the primary search contract.

Raw payload retention MUST be off by default. Enabling it is an explicit per-source or global opt-in. This protects the local-first promise from accidentally hoarding entire provider responses on disk.

## 10. Search

ctxindex MUST provide full-text search over normalized resource and chunk content, plus typed field filtering and aggregation over profile-declared fields. Full-text search is the mandatory baseline and MUST remain usable even when vector or semantic features are unavailable.

Full-text search SHOULD use BM25-style ranking where supported by the local search backend.

Full-text search SHOULD index chunks for body/content search and resource envelopes for title, summary, path, and other envelope metadata. Search SHOULD return resources with their best matching chunks.

Vector search, when implemented, SHOULD be optional and attach embeddings to chunks, not whole resources. Embedding support SHOULD include embedding job tracking and chunk embedding storage.

When full-text and vector results are combined, hybrid search SHOULD use reciprocal rank fusion with `k = 60` as the default merge strategy unless later evidence justifies a different default.

Search results SHOULD support filtering by source, source adapter, extension, account, realm, kind (primary profile id or declared alias), profile-declared typed fields, time range, and deleted/tombstoned state. Field filter validity per kind derives from the profile registry (§3d).

Search SHOULD provide an explain/debug mode that shows which index paths contributed to a result and enough ranking information to debug poor matches.

## 10e. Search routing and remote search

Search routing follows the precedence in §3c: CLI flag over per-source configuration over adapter decision. The legacy single "search mode" declaration is replaced by the `search-remote` capability flag plus an adapter routing choice that MAY consult sync coverage. The descriptions below define the coverage patterns an adapter MAY implement:

- **`indexed`** — the adapter fully replicates searchable content into the local database. All search for its sources is served by local full-text search. This is the required mode for local filesystem sources.
- **`federated`** — the source does not bulk-replicate content. Its adapter MUST implement `search-remote`, translating ctxindex queries into the provider's native search API. Results are normalized into envelope-level resources at query time.
- **`hybrid`** — the adapter maintains a **bounded local hot window** of recent/pinned content in the local index and implements the adapter search capability for content outside that window.

Pattern requirements:

- A fully-`indexed` source does not require the `search-remote` capability. A `federated` or `hybrid` source's adapter MUST declare and implement it.
- A `hybrid` adapter's local window MUST be bounded by per-source configuration (for example a trailing time window or label set). Full-mailbox or full-corpus replication MUST NOT be the default for `hybrid` adapters.
- A `hybrid` source's window sync MUST reconcile the window on each successful run: resources that fall out of the window MAY be demoted to envelope-only rather than tombstoned, since the canonical record still exists at the provider.
- Federated search calls MUST go through the central network egress chokepoint and are limited to the adapter's declared provider hosts (§17).
- Federated and hybrid adapters SHOULD support the `retrieve` capability for on-demand hydration: fetching full content for a specific resource at read time. Hydrated content is cached as `adhoc` rows (§3b) and MUST be treated as purgeable.
- Every adapter MUST use the ref grammar (`ctx://<source-id>/<suffix>`) identically for synced and provider-search results. Search origin MUST NOT alter resource identity or ref.

Search planning:

- The search service MUST serve queries for `indexed` sources (and hybrid hot windows) from the local full-text index, and MUST fan out to the adapter search capability for `federated` sources and for `hybrid` sources when the query is not satisfiable from the local window alone.
- Merged results MUST be ranked per origin and interleaved; implementations MUST NOT compare raw scores across origins (local BM25 scores and provider relevance are not commensurable).
- When a federated origin fails (offline, auth expired, provider error), search MUST still return local results and MUST surface a per-origin warning rather than failing the whole query.
- Explain/debug output (§10) MUST report each result's origin (local index vs. provider search).
- Offline behavior: with no network, `indexed` sources and hybrid hot windows remain fully searchable; federated origins degrade with a warning.

## 10f. Retrieval, artifacts, and export

Retrieval: `get <ref>` MUST return the complete resource, serving from local rows when present and invoking the adapter's `retrieve` capability otherwise. Retrieved resources are cached as `adhoc` rows (§3b).

Thread retrieval: `thread get <ref>` MUST return the union of provider conversation membership and the reply-tree walk over `parent` relations in both directions, presenting a tree when parent edges exist and a flat, date-ordered list otherwise.

Artifacts: artifact bytes MUST live in a content-addressed store with recorded media type, size, origin ref, and retention class. Downloads MUST be served from the store when present (cache) and via the adapter's `download` capability otherwise. `--output` copies bytes to a caller path; the store remains the system of record. Artifact retention during sync is policy-driven and MUST NOT default to fetching all bytes. The store MUST support purge and disk accounting.

Export: `export <ref> --format <f>` resolves the resource's profile, looks up `f` in its export map, and streams the rendered representation. Valid formats per kind are exactly the profile-declared export map keys. Core MUST NOT implement format conversion pipelines; a JSON export of the validated payload is always available without profile declaration.

Search results and describe output SHOULD carry machine-readable affordances (available operations per result derived from capability flags and profile vocabulary) so callers never need provider-specific knowledge.

## 10a. Realms

A realm is a user-defined organization/search scope. ctxindex MUST support multiple realms and MUST seed a `global` realm on initialization.

Every source MUST belong to exactly one realm. A source without an explicit realm assignment MUST fall into the `global` realm. A realm MAY contain sources from any provider, account, or source adapter.

Realms MUST NOT be treated as a security boundary. Credentials, grants, and account isolation MUST be enforced at the account/grant level, not by realm membership.

Multiple sources MAY use the same account or grant across different realms when the provider permits it.

Every source whose adapter requires authentication MUST store an explicit `grant_id` link. Such a source MUST NOT be created without a valid provider-compatible grant. When exactly one compatible grant exists, the CLI MAY bind it automatically; when zero or multiple compatible grants exist, source creation MUST fail unless the caller identifies one explicitly. Sync and federated search MUST resolve credentials only through the source's linked grant and MUST NOT select a global "active" or most-recent grant.

Search SHOULD default to all realms when no realm filter is provided. Callers SHOULD be able to filter to one or more realms. When a realm filter is provided, the `global` realm SHOULD be implicitly included unless the caller explicitly opts out via an exclusive filter.

## 10b. CLI surface and output

The reference CLI SHOULD provide commands for initialization, authentication, source configuration, sync, search, status, and maintenance. The specific command set offered by a release is captured in that release's milestone document.

CLI output SHOULD be token-efficient by default: compact human-readable text with one item per line and only key fields. Verbose human output and machine-readable JSON SHOULD be opt-in flags.

Every read command SHOULD support a machine-readable JSON output mode.

User-facing configuration SHOULD be reachable through CLI commands. Direct TOML editing MAY remain as a power-user path, but the CLI MUST be able to express the same configuration without hand-edited TOML.

The CLI MUST NOT use interactive TTY prompts for required input. Every required input MUST be expressible via flags, environment variables, or explicitly declared stdin. Missing required input MUST fail with a clear error and a non-zero exit code, not by waiting for an interactive answer. The one permitted exception is the user's browser during an OAuth authorization redirect; even there, the CLI MUST also accept the authorization result via flag (e.g. `--auth-code <code>`) so headless and agent-driven flows can complete the same operation without a browser.

References to entities that do not exist (unknown realm, unknown source id, unknown adapter id) MUST fail fast with an actionable error message and MUST NOT auto-create the missing entity unless an explicit create flag is passed.

## 10c. Skills surface

ctxindex SHOULD ship bundled skill documentation alongside the binary so agents can discover usage without external docs. The skills surface SHOULD provide at least:

- a list command that prints bundled skill names and summaries;
- a get command that prints one skill's content, with an option to inline all referenced docs;
- a path command that prints where bundled skills live.

Bundled skill docs MUST be versioned with the ctxindex release that ships them.

Agent-facing documentation of kinds, fields, filters, formats, and adapter flags MUST be derived from the loaded definitions (profiles, adapters, config schemas), not hand-maintained in parallel. Hand-written prose is limited to workflow guidance and definition-level `docs` fields.

## 10d. Module boundaries

`apps/cli` is a thin shell around `@ctxindex/core` services. Command files under `apps/cli/src/commands/**/*.ts` MUST limit themselves to parsing arguments, calling a core service, formatting the result, mapping typed errors, and returning an exit code.

Code under `apps/cli/src/**` MUST NOT import `bun:sqlite` or `drizzle-orm/*`. It MUST NOT contain raw SQL literals for `INSERT`, `UPDATE`, `DELETE`, or `SELECT` statements.

Code under `apps/cli/src/**` MUST NOT issue `fetch()` calls to provider APIs such as OAuth or Gmail endpoints. Provider HTTP behavior belongs in `@ctxindex/core` or `@ctxindex/adapters`.

Code under `apps/cli/src/**` MUST NOT generate ULIDs or UUIDs and MUST NOT encode schema column names. Identity assignment and schema knowledge are core concerns.

The OAuth loopback flow MAY bind a `127.0.0.1` socket from `apps/cli` because browser launch and redirect capture are user-interface concerns. The authorization code exchange MUST be delegated to a `@ctxindex/core/auth` function.

## 11. Concurrency

ctxindex MUST coordinate sync executions through an advisory lock table:

```text
sync_locks
  scope          PK; 'global' or 'source:<source_id>'
  run_id         FK sync_runs.id when held by a running sync
  acquired_at    ms since epoch
```

The sync runner MUST acquire the appropriate lock row before transitioning a `sync_run` from `running` to active. If the row already exists, the runner MUST exit with `sync_runs.status = cancelled` and `error_summary = "sync busy"`.

A crashed sync MUST be recoverable by a stale-lock release step at startup: if `sync_runs[run_id].status` is not `running`, the lock row is deleted.

At minimum, an implementation MUST hold a global advisory lock (`scope = 'global'`) for the duration of any sync. Per-source concurrency (`scope = 'source:<source_id>'`) MAY be added without a schema migration. Which scope a release writes is captured in its milestone document.

SQLite MUST be opened in WAL mode with `foreign_keys = ON`, `synchronous = NORMAL`, and a configured `busy_timeout`. Readers (search, status) MUST NOT take the sync lock.

## 12. Error taxonomy

Adapters MUST surface failure as a typed `CtxindexSyncError` (or subclass) carrying one of the codes below. The sync runner is the only component that translates these into persisted `sync_runs.status` and `source_sync_state.last_status`.

```text
CtxindexSyncError codes
  auth_expired             refresh token still valid; access token expired and refresh failed
  auth_revoked             refresh token rejected; user must re-authorize
  rate_limited             provider rate or quota limit, with retryAfterMs when known
  network                  DNS/TCP/TLS failure or timeout
  provider_unavailable     5xx from provider
  provider_bad_response    response parse / Zod-validation failure
  provider_quota           account quota exhausted (e.g. mailbox over storage)
  not_found                resource referenced by cursor no longer exists
  permission_denied        403 / scope mismatch from provider
  cancelled                aborted by SIGINT, SIGTERM, or explicit cancel
  unknown                  fallback; MUST include cause for diagnostics
```

Adapters MAY also yield non-fatal warning ops that increment `sync_runs.errors_count` and append to `error_summary` without aborting the run.

Mapping rules (normative):

- `sync_runs.status` = `completed` only when the iterator completes without throwing.
- `sync_runs.status` = `cancelled` when the cause was `cancelled`.
- `sync_runs.status` = `failed` for every other code.
- `source_sync_state.last_status` = `needs_auth` for `auth_expired | auth_revoked`.
- `source_sync_state.last_status` = `idle` after a `completed` run.
- `source_sync_state.last_status` = `failed` for every other terminal error.
- `source_sync_state.last_status` = `disabled` is set only by the CLI, never by the runner.

User-visible CLI exit codes MUST be stable: `0` success, `2` invalid usage, `10` `needs_auth`, `20` rate-limited, `30` network/provider, `40` permission denied, `50` other sync failure, `130` cancelled (SIGINT).

## 13. Time and clock

All persisted timestamps in core and adapter tables MUST be `INTEGER` milliseconds since the Unix epoch in UTC. SQLite has no first-class datetime type; integer ms gives stable sort, cheap range queries, and trivial arithmetic.

Calendar event tables MUST also store the IANA timezone string (`Europe/Ljubljana`, `UTC`, etc.) alongside `start_at` / `end_at` so display can round-trip the original timezone. Recurrence rules MUST be stored as their iCal RRULE strings; runtime expansion uses the timezone field.

All-day events MUST use UTC-midnight integers; the `is_all_day` flag indicates date-only semantics so display can avoid timezone shifts.

Conversion to RFC3339 happens only at output boundaries (`--json`, log records). Adapters MUST NOT persist provider-formatted strings into core or shared adapter tables.

## 14. Identifiers

All ctxindex-owned primary keys MUST be ULIDs (Crockford base32, 26 characters, time-ordered). This covers `resources.id`, `sync_runs.id`, `sync_run_checkpoints.id`, `accounts.id`, `account_identities.id`, `realms.id` (slug-named realms keep their slug as id; ULID only when no human slug applies), `sources.id`, `grants.id`, `artifacts.id`, and equivalents.

Provider identifiers MUST NOT serve as core primary keys. Provider ids live in `external_refs`, refs, and field-index rows.

ULIDs MUST be generated client-side from a single library helper. SQL-generated ids MUST NOT be used.

## 15. Cross-source duplicates

ctxindex MAY collapse resources that share an external reference such as `rfc822_message_id`. Until an implementation does so, each source's copy of a duplicated record is a separate resource. Natural-key relations (§4) already join such copies for thread traversal without collapsing identity. The `rfc822_message_id` external ref MUST be stored when present so cross-source collapse can be added without a schema migration.

## 15a. Tombstones and retention

Deleted synced resources MUST be retained as tombstones (`deleted_at` set; row not removed). Search MUST exclude tombstoned resources unless an `--include-deleted`-equivalent filter is passed. `adhoc`-origin rows are cache entries: they are evicted (by purge or cache policy), never tombstoned.

ctxindex MAY ship a `maintenance purge --tombstones --older-than <duration>` command to hard-delete tombstoned rows. Tombstone purging MUST NOT run automatically.

## 15b. Backup and export

The baseline supported backup procedure is: stop active syncs, then copy the SQLite file (and the secrets store file if one is used).

ctxindex MAY ship an `export` command. Any such export format MUST be either declared stable in a release document or marked unstable. Unstable export formats SHOULD NOT be relied on for cross-version restore.

Schema migrations MUST keep `ctxindex.sqlite` upgradable between releases via the registered migration namespaces.

## 16. Distribution and versioning

ctxindex MAY be distributed via package registries, compiled binaries, or source checkouts. The chosen distribution method MUST NOT change the on-disk schema or CLI surface beyond what is documented in this spec.

A specific release's chosen distribution channel is captured in its milestone document.

## 17. License and security posture

License: **MIT**.

ctxindex is local-first. The reference implementation MUST NOT:

- emit telemetry, analytics, crash reports, or update pings;
- contact any host that is not a declared provider API for an active source;
- store user-visible secrets outside the configured secrets store (keychain or encrypted file).

ctxindex MUST:

- keep all indexed content in the local SQLite database under the user's home directory;
- store secrets only as references in TOML and SQLite, with cleartext only in the secrets store;
- redact known sensitive fields at the logger boundary;
- treat the SQLite file, the log directory, and the secrets store as user-controlled files (`0600` for secrets-related files; `0700` for their parent directories where feasible).

Network egress is limited to declared provider APIs needed to satisfy a sync of a registered source. Adding a provider that talks to a non-provider host requires a SPEC change.
