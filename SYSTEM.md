# ctxindex System Reference

> **NON-NORMATIVE — readable projection, not the contract.** If this document conflicts with a capability specification, `openspec/specs/<capability>/spec.md` wins.
>
> **Last refreshed:** 2026-07-18
>
> **Sources consulted:** `README.md`; `CONTEXT.md`; all 18 capability specs and all 17 sidecars present on 2026-07-18 (`core-model` has none); the `agent-orientation-guidance` change's CLI-surface and search-routing delta specs; decisions D1–D22 in `docs/design/2026-07-13-context-access-layer.md`; `.agents/skills/repo-development/SKILL.md`; and current CLI help/registry output. Section 13 is the full index.

## 1. 10-minute tour

ctxindex gives agents one command vocabulary for context spread across providers and local files. A message, calendar event, and file all become **Resources** with stable `ctx://` **Refs**. Providers and files remain canonical; ctxindex keeps local projections and caches for search, retrieval, Relations, export, and narrowly typed **Actions**.

```text
agent -> CLI -> provider-neutral core -> Source -> Source Adapter -> provider/files
                 |                       |
                 +-> SQLite + cache      +-> one Realm, optional Account Grant
```

Sync transactionally materializes a Source; live search/retrieval returns the same Ref shape and may leave purgeable ad-hoc cache entries.

### A real local end-to-end journey

These development commands were checked against the current CLI. With an installed binary, replace `bun cli` with `ctxindex`.

```sh
mkdir -p /tmp/ctx-tour
printf 'Quarterly planning notes for Project Aurora.\n' > /tmp/ctx-tour/plan.txt

bun cli init
bun cli realm add work
bun cli describe adapter local.directory --json
bun cli source add local.directory \
  --realm work --label work-files \
  --config-root-path /tmp/ctx-tour
bun cli source list --json
bun cli sync --source work-files --json
bun cli search planning --realm work --kind file --local-only --json
bun cli get 'ctx://<SOURCE_ULID>/file/plan.txt' --json
bun cli status --source work-files --json
```

Expected output shapes, omitting generated ids and timestamps:

| Command | Shape and meaning |
| --- | --- |
| `init` | Readable initialization confirmation. It creates no implicit Realm. |
| `describe adapter … --json` | Adapter `id`, `version`, Profiles, routing, auth, capabilities, config JSON Schema, and generated config options such as `--config-root-path`. |
| `source list --json` | Array of Sources with id, label, Realm, Adapter, config, availability, Grant link, and sync counts. This Source has `grantId: null`. |
| `sync … --json` | `{ "mode": "sync", "results": [{ "sourceId": "…", "status": "completed", "run": { "runId": "…", "mode": "sync", "status": "completed", "added": 1, "updated": 0, "deleted": 0, "errorsCount": 0, "warnings": [] } }], "warnings": [] }` |
| `search … --json` | `{ "results": [{ "ref": "ctx://…/file/plan.txt", "profile": { "id": "file", "version": 1 }, "origin": "local", "title": "plan.txt", "chunks": [{ "index": 0, "snippet": "…planning…" }] }], "pagination": { "offset": 0, "limit": 20, "hasMore": false }, "warnings": [] }` |
| `get … --json` | `{ "resource": { "ref": "ctx://…", "realmId": "work", "profile": { "id": "file", "version": 1 }, "origin": "synced", "payload": { "path": "plan.txt", "mediaType": "text/plain", "text": "…" } }, "warnings": [] }` |
| `status … --json` | Array with Source availability, last status/run, error count, last error, and opaque Adapter cursor. |

OAuth Sources add `client add`, `account add`, and `--account` on `source add`. Before mutating provider state, inspect `action describe <id> --source <source> --json`. V1 only creates or updates email Drafts; it never sends them.

## 2. Overview and value proposition

ctxindex is a **local personal-context gateway** with four operations over the same configured Sources:

- **Discover** through local full-text/typed indexes, provider search, or both.
- **Retrieve** a complete Resource, thread, Artifact, or Profile export by Ref.
- **Sync** a Source into a searchable local projection with durable cursor history.
- **Act** through a Profile-declared provider mutation bound to one explicit Source.

This is a deterministic access model, not a canonical database. A Ref survives synced, remote, cached, and temporarily unavailable states.

The CLI is the agent integration surface. Agents compose generic commands with `--json`; loaded registries define valid kinds, fields, Source options, exports, and Actions. There is no provider-specific command family, SaaS canonical store, workflow-policy engine, arbitrary Extension command surface, or MCP server in the current product.

Package responsibilities are stable: `@ctxindex/cli` parses, composes, formats, and maps final exits; `@ctxindex/core` owns provider-neutral runtime and storage; `@ctxindex/extension-sdk` owns public authoring contracts; `@ctxindex/profiles` owns bundled vocabulary; and `@ctxindex/adapters` owns provider transport and normalization.

## 3. Domain model

| Term | Meaning |
| --- | --- |
| **Realm** | User-created reasoning/search scope containing Sources. Omitted filters span all Realms; explicit filters are exact. No `global` Realm exists. |
| **Source** | One globally labeled connection through one Source Adapter, in exactly one Realm, optionally bound to one Grant. |
| **Client** | Stored OAuth application configuration for one provider; its label is unique within that provider. |
| **Account** | Stable authenticated provider identity with a globally unique local label. Verified addresses are Account Identities, not the key. |
| **Grant** | One stable normalized permission/token record owned by one Account and shareable by compatible Sources. |
| **Profile** | Versioned Resource schema and vocabulary: projections, fields, Relations, Artifacts, exports, docs, aliases, and Actions. |
| **Action** | Typed provider mutation declared by a Profile and implemented through one Source Adapter. |
| **Draft** | Reversible provider-persisted proposed message; conversation text alone is not a Draft. |
| **Extension** | Bundle of Profiles and Source Adapters; it has no command surface. |
| **Source Adapter** | Provider/file implementation of declared sync, remote-search, retrieve, download, and Action operations. |
| **Capability** | Declared operation class, not a provider permission or Action. |
| **Resource** | Common envelope naming one primary Profile, with an optional payload conforming to it. |
| **Ref** | `ctx://<source-id>/<adapter-opaque-suffix>`, stable independently of local materialization. |
| **Relation** | Typed edge to a Ref or natural key that may resolve later. |
| **Artifact** | Lazily downloaded bytes in the managed cache. |
| **Materialization** | Purgeable local projection from Sync or ad-hoc access. |
| **Field Index** | Generic typed rows projected from Profile fields. |
| **Sync Run** | One recorded refresh attempt, separate from current Source state. |

Internal row ids are not Refs. The same provider record exposed by two Sources remains two Resources; natural-key Relations can connect them without collapse. Relations are order-independent, bidirectional, and may resolve after a target arrives. Generic threading uses conversation and parent edges rather than mail-specific tables.

## 4. Trust boundaries and security model

Indexed content stays in local SQLite under the user's home; providers and files remain canonical, and local directory Sources index in place. SQLite, logs, and the secrets store are user-controlled; secrets-related files use `0600` and parent directories use `0700` where feasible. SQLite and config hold typed secret references, not cleartext; values live in the configured OS Keychain or optional encrypted file backend. Recognized references are `keychain:<service>/<account>/<key>`, `file:<path>#<key>`, and centrally loaded `env:<VAR>`/`env://<VAR>`. Bare secrets are rejected.

Client credentials are read from Adapter-declared environment variables only during `client add --from-env`, then persisted. Authorization and refresh use stored Client/Grant state. Tokens, client secrets, passphrases, and authorization codes do not enter literal command arguments.

A backend move copies and verifies target entries before switching durable references and configuration, then cleans old entries. Typed prefixes keep an interrupted mixed state readable. An unavailable configured backend causes failure; no implicit fallback occurs.

Provider requests pass through central authorized fetch with declared host restrictions. Logs redact known sensitive fields, and the reference system emits no telemetry or update pings.

External Extensions are explicitly configured TypeScript/JavaScript loaded in-process with full trust. Runtime validation protects registry consistency, not the host from malicious code. A Realm scopes reasoning and search, not credentials or filesystem access; auth isolation comes from Account, Grant, Source binding, and host restrictions.

## 5. Extension architecture

Profiles own pure domain semantics: schema validation, title/summary/chunk projections, typed fields, Relations, Artifact descriptors, exports, aliases, docs, and Action declarations. Adapters own auth metadata, config schema, routing, provider I/O, response validation, normalization, and implementations. Core receives normalized Resources, warnings, sync emissions, bytes, and Action results rather than provider DTOs.

`defineProfile`, `defineAdapter`, and `defineExtension` produce plain versioned definitions. Registries bind by `(id, version)`. The four operation capabilities are `sync`, `search-remote`, `retrieve`, and `download`; each declared capability needs its implementation. Actions are separate Profile-id bindings. Registry construction rejects duplicate or inconsistent definitions before any part of an invalid Extension activates.

Adapters receive host-provided operation contexts: Source identity/config, cancellation, scoped logging, allowlisted authorized fetch, declared secret access, Artifact sink, and operation-specific emission. They neither import core runtime internals nor write tables.

V1 loads trusted `.ts`/`.js` Extensions from explicit local paths. Built-ins load first. Import, factory, schema, duplicate-id, or capability failure becomes a diagnostic and rejects that external Extension atomically. Auto-discovery, package/git installation, sandboxing, and out-of-process/non-TypeScript Adapters are deferred. Bun is pinned to 1.3.14 for compiled distribution and external TypeScript Extension compatibility.

If an Extension disappears, Sources become `extension_unavailable`. Existing local Resources remain searchable, degrading to their envelope when vocabulary is missing; provider operations stop. Restoring the Extension restores availability without deleting data.

## 6. Accounts, Clients, Grants, and Realms

```text
Client -> authorizes -> Account -> owns one -> Grant -> binds explicitly -> Source -> Adapter
  | provider-local label  | global label       | scopes + secret refs      | global label
Realm ------------------------- contains exactly one ----------------------> Source
```

A Client’s verbatim default label is the provider id and uniqueness is provider-local. Inventory hides values and references. Removal deletes Client metadata and credentials while existing Grants retain refresh state.

`account add <provider>` chooses one persisted provider Client automatically, gives add guidance when none exist, and requires `--client` when several exist. Consent combines provider base scopes with the sorted union of loaded Adapters’ operation scopes for that provider. Loading fewer Extensions narrows consent; authorization has no one-off Adapter selector. Echoed operation scopes are checked exactly, and refresh preserves previous scopes when the provider omits them.

The provider’s stable subject identifies the Account; email is a verified identity and default-label candidate. Reauthorization updates the same Account and single stable Grant in place. A new explicit label renames it rather than duplicating it.

An authenticated Source resolves `--account` by exact label, Account id, then Grant id within the Adapter provider. Core checks scope compatibility. No “active” or newest credential fallback exists; compatible Sources can deliberately share one Grant across Realms.

Every Source names an existing Realm. Source labels default to `<account-label>-<adapter-tail>`, or `<adapter-tail>` without auth, and are globally unique. Collisions fail unchanged—no normalization, prompting, overwrite, or suffixing.

Removing an Account deletes its Grant and secrets but leaves Sources configured with cleared links and `needs_auth`. Re-adding the identity creates a fresh Grant without silently rebinding them.

## 7. Search and sync behavior

```text
SYNC                                           SEARCH / RETRIEVE
Adapter iterator -> validated emissions        normalized query -> core planner
                         |                                     /          \
                 one transaction                         local FTS     remote Adapter
              / fields/chunks/Relations                     \             /
       Resources/tombstones/cursor                        interleave + dedupe
                                                                  |
                                                        get Ref: local first,
                                                        else retrieve + adhoc cache
```

Search accepts text, filters, or both. Query-less search needs a filter, stays local, and enumerates projections; bare `search` is invalid. Profile-defined kinds, aliases, fields, and typed values reject bad filters before I/O.

Routing precedence is CLI override (`--local-only`/`--remote`), Source override, then Adapter routing. Indexed coverage uses local search; federated Sources use provider search; hybrid Sources can add a remote leg when local coverage is insufficient. Query-less `--remote` is invalid. Exact Realm/Source filters apply before execution.

Core round-robin interleaves incomparable local/provider rankings and deduplicates Refs. Remote failure becomes a warning while local results survive. Explain reports route, legs, coverage, and degradation.

Filter-only local enumeration orders occurrence time descending, missing times last, then Ref. Local-only pagination uses offset/limit and returns `hasMore`; offset is rejected for remote or mixed queryful searches. Remote pagination and filter-only remote enumeration are deferred.

`get <ref>` returns complete local state first. Otherwise, core invokes that Source’s `retrieve`, requires the requested Ref, validates the payload, and caches complete `adhoc` state. Remote search may cache only an envelope; a later get hydrates it. Syncing the same Ref upgrades one row to `synced`.

A sync-capable Adapter emits upserts, removals, checkpoints, and warnings. Core records a Sync Run and transactionally applies Resources, projections, Relations, tombstones, and final cursor. Failure preserves the prior durable cursor; checkpoints do not become current before completion. `sync` is baseline; `resync` and `diff` depend on Adapter support, and `diff` validates while rolling back materialized changes.

A global advisory lock prevents overlapping syncs. A second attempt records cancelled `sync busy`; readers continue. SQLite uses WAL, foreign keys, normal synchronous mode, and bounded busy timeout. Synced deletion creates a tombstone hidden from ordinary search; deleting an ad-hoc cache entry does not.

## 8. Provider coverage and limitations

Both calendar Adapters emit `calendar.event@1`, sync one calendar in an anchored rolling window, retrieve through `get`, and expose no write Action. Timed events keep instants/zones; all-day events keep half-open dates. Incomplete scans preserve prior state.

`google.calendar@1` defaults to the primary calendar or selects one explicit id. Initial sync commits only the final token after all pages. Token invalidation warns and triggers bounded full reconciliation. Missing events cause removals only after a complete scan. Unsupported variants such as `fromGmail` and `workingLocation` are skipped with `google_calendar_unsupported_event`; `birthday` becomes an ordinary all-day event. Retrieval rejects foreign-Source Refs before auth/network access.

`microsoft.calendar@1` supports personal and organizational Accounts. The default calendar uses stable Graph calendar-view delta; a named calendar uses complete paged stable-version scans and manifest reconciliation instead of the beta per-calendar delta route. Requests use immutable-id and UTC preferences. Unmapped Windows time zones can warn with `microsoft_calendar_unresolved_series_start`.

The calendar specs conflict on recurring Google identity: `calendar-context` describes one series Resource plus changed/cancelled exceptions, while `google-calendar-adapter` describes each expanded occurrence as a distinct stable Resource. This reference cannot choose; recurrence storage needs canonical clarification.

`microsoft.mailbox@1` covers remote search, retrieval, conversation Relations, file attachments, exports, and Drafts; immutable Graph IDs preserve Refs across moves. Shared contracts cover Gmail search/Actions, but no dedicated Gmail mailbox spec establishes provider transport details.

`local.directory` is unauthenticated and indexed, with one root and file Resources. Fine-grained scanner behavior should be discovered from the loaded registry: there is no dedicated local-directory ingestion specification. Likewise, Profile expressibility for tasks, files, communication, calendars, and external domains does not imply complete bundled Adapter coverage.

## 9. Typed Actions and Drafts

Profiles declare Action id, input schema, output Profile, effect, docs, and examples. Adapters bind provider implementations. `action describe` reports the registry contract and per-Source availability; `action run` requires one Source, validates all input before provider I/O, invokes once with automatic unauthorized retry disabled, validates output, and may cache the result as complete `adhoc` state.

V1 exposes exactly:

- `communication.message.draft.create`
- `communication.message.draft.update`

Google and Microsoft mailbox Adapters bind the same provider-independent shapes. Create returns a normalized message Resource; update replaces complete recipients, subject, and text for an existing same-Source Draft while preserving its Ref. Gmail uses stable Draft identity; Microsoft requests immutable Graph ids.

There is no send, reply-send, forward-send, calendar mutation, or other provider mutation. Microsoft’s narrow Draft-capable permission includes message write access but excludes `Mail.Send`. Ambiguous mutation outcomes are not automatically retried. Agent wording, approval, and workflow policy stay outside ctxindex; text becomes a Draft only after provider persistence succeeds.

The generic model can describe irreversible Actions and requires explicit non-interactive confirmation, but no irreversible Action ships.

## 10. Storage model

`@ctxindex/core` owns generic SQLite storage, schema changes, sync bookkeeping, and the Artifact store. Adapters own no tables. A Resource stores internal id, Ref, Source/Realm, Profile/version, `synced` or `adhoc` origin, completeness, envelope times/text, validated payload, and derived fields, chunks, Relations, and Artifact descriptors.

Field Index rows keep each scalar/array element in a native text, numeric, or integer slot with ordinal. Chunks feed full-text search. Updating a payload transactionally replaces all Profile-derived projections.

Relations store one logical edge and zero-to-many resolutions. Ref targets resolve directly; natural keys may dangle and resolve later across Sources/Realms. Tombstoned targets remain linked but hidden by default; evicted ad-hoc targets can resolve again if rematerialized.

Remote envelopes, retrieved payloads, and synced content share Resource tables. `adhoc` is purgeable cache state; Sync upgrades an identical Ref to `synced`, while synced provider deletion creates a tombstone. Optional raw provider payloads are off by default, non-authoritative, and purgeable.

Artifact descriptors remain with Resources while bytes are lazy. First download streams bytes into a SHA-256 content-addressed store and records metadata under the sole `cached` retention class. Later downloads reuse it; `--output` copies without transferring cache ownership. `purge artifacts` removes bytes but leaves descriptors for refetch. No automatic eviction exists.

Core bookkeeping timestamps use UTC Unix-epoch milliseconds; Profile payloads may preserve RFC 3339 instants or local dates. Opaque ctxindex-owned primary keys are client-generated ULIDs; a Realm uses its human slug as primary key, or a ULID without one. Provider IDs are never core primary keys. Exports resolve formats from Profiles, not a core conversion pipeline. A basic backup stops Sync, then copies SQLite and the encrypted secret file when used. External systems remain canonical. Prototype databases have no compatibility obligation; cross-source deduplication, Extension-private tables, and payload-version migration are deferred.

## 11. CLI surface and stable exit codes

The CLI is deterministic and non-interactive. Input comes from non-secret flags, declared environments, typed references, files, or declared stdin. Missing input fails instead of prompting. The only interactive surface is a browser in an explicitly requested OAuth loopback.

Readable output is compact; JSON goes to stdout and diagnostics to stderr. Registry-backed `describe` owns fields, formats, config flags, OAuth declarations, and Action schemas, avoiding duplicated help.

Generic verbs cover initialization, Client/Account/Realm/Source management, sync, search, get, threads, Artifacts, exports, Actions, status, purge, Extensions, secrets, and bundled skills. Exact labels/ids resolve without auto-creation. Bundled skills provide concise orientation to what ctxindex is, when to use it, and the live discovery surfaces; generated help and loaded-definition output remain authoritative for interface facts.

| Exit | Stable meaning | Caller response |
| ---: | --- | --- |
| `0` | Success | Consume stdout; inspect warnings. |
| `2` | Invalid usage | Correct arguments, schema input, filter, label, or selection. |
| `10` | `needs_auth` | Reauthorize the affected Account. |
| `20` | Rate limited | Back off; use `retryAfterMs` when present. |
| `30` | Network/provider failure | Preserve local results and apply workflow retry policy. |
| `40` | Permission denied | Correct provider permission or Grant scope. |
| `50` | Other sync failure | Inspect status and diagnostics. |
| `130` | SIGINT cancellation | Treat as interrupted; prior durable cursor remains valid. |

Sync Run history records `completed`, `cancelled` for cancellation, and `failed` otherwise. Current Source state becomes `idle` after completion, `needs_auth` for expired/revoked auth, and `failed` for cancellation and other terminal errors; only the CLI sets `disabled`. Warnings increment counts/summaries without overturning a completed run.

## 12. Known limitations and deferrals

- Provider mutations stop at reversible email Draft create/update; sending and calendar writes are absent.
- Gmail mailbox and local-directory ingestion lack dedicated capability specs; shared contracts and registry discovery set their documented boundary.
- Recurring Google event identity has an unresolved conflict between two canonical specs.
- Profile expressibility does not equal complete bundled provider coverage for tasks, files, communication, or arbitrary Extension domains.
- Full-text search is baseline; semantic/vector search, watch/notifications, and mature quota policy are optional or deferred.
- Remote filter-only enumeration, remote pagination, and mixed-search offset pagination are unsupported.
- `resync` and `diff` depend on Adapter support; `sync` is baseline.
- Artifacts have one cached retention class and no automatic eviction. Raw provider payloads are optional and off by default.
- External Extensions are trusted in-process explicit-path code. Discovery/install, sandboxing, arbitrary commands, and non-TypeScript/out-of-process Adapters are deferred.
- Per-Extension storage, multiple primary Profiles, cross-source identity collapse, and payload migration await demonstrated need.
- There is no SaaS canonical store, MCP server, workflow-policy engine, or universal sync protocol.
- Realms organize context but do not isolate credentials or Relation resolution.
- Export stability needs an explicit release declaration. Pre-release prototype data and command compatibility are not preserved.
- Live-provider checks require human approval and redacted evidence; automation uses isolated state and loopback providers.

## 13. Source index

Capability specifications are normative. Sidecars and design/skill documents explain intended implementation and rationale. The exact sources below cover all 18 capability specs and all 17 sidecars present on 2026-07-18.

| Section | Exact sources distilled |
| --- | --- |
| 1 | `README.md`; `CONTEXT.md`; `openspec/specs/core-model/spec.md`; `openspec/specs/cli-surface/spec.md`; `openspec/specs/cli-surface/implementation.md`; `openspec/specs/realm-and-source-management/spec.md`; `openspec/specs/realm-and-source-management/implementation.md`; `openspec/specs/search-routing/spec.md`; `openspec/specs/search-routing/implementation.md`; `openspec/specs/sync-operations/spec.md`; `openspec/specs/sync-operations/implementation.md`; `openspec/specs/retrieval-and-artifacts/spec.md`; `openspec/specs/retrieval-and-artifacts/implementation.md`; `.agents/skills/repo-development/SKILL.md` |
| 2 | `openspec/specs/core-model/spec.md`; `openspec/specs/module-architecture/spec.md`; `openspec/specs/module-architecture/implementation.md`; `docs/design/2026-07-13-context-access-layer.md`; `README.md` |
| 3 | `CONTEXT.md`; `openspec/specs/core-model/spec.md`; `openspec/specs/generic-storage/spec.md`; `openspec/specs/generic-storage/implementation.md`; `openspec/specs/profile-vocabulary/spec.md`; `openspec/specs/profile-vocabulary/implementation.md`; `openspec/specs/realm-and-source-management/spec.md` |
| 4 | `openspec/specs/core-model/spec.md`; `openspec/specs/secret-backend-operations/spec.md`; `openspec/specs/secret-backend-operations/implementation.md`; `openspec/specs/account-grant-management/spec.md`; `openspec/specs/account-grant-management/implementation.md`; `openspec/specs/extension-loading/spec.md`; `openspec/specs/extension-loading/implementation.md`; `docs/design/2026-07-13-context-access-layer.md` |
| 5 | `openspec/specs/extension-loading/spec.md`; `openspec/specs/extension-loading/implementation.md`; `openspec/specs/profile-vocabulary/spec.md`; `openspec/specs/profile-vocabulary/implementation.md`; `openspec/specs/module-architecture/spec.md`; `openspec/specs/module-architecture/implementation.md`; `docs/design/2026-07-13-context-access-layer.md` |
| 6 | `openspec/specs/oauth-client-management/spec.md`; `openspec/specs/oauth-client-management/implementation.md`; `openspec/specs/account-grant-management/spec.md`; `openspec/specs/account-grant-management/implementation.md`; `openspec/specs/realm-and-source-management/spec.md`; `openspec/specs/realm-and-source-management/implementation.md`; `openspec/specs/generic-storage/spec.md`; `openspec/specs/cli-surface/spec.md` |
| 7 | `openspec/specs/search-routing/spec.md`; `openspec/specs/search-routing/implementation.md`; `openspec/specs/sync-operations/spec.md`; `openspec/specs/sync-operations/implementation.md`; `openspec/specs/retrieval-and-artifacts/spec.md`; `openspec/specs/retrieval-and-artifacts/implementation.md`; `openspec/specs/generic-storage/spec.md`; `openspec/specs/error-taxonomy/spec.md`; `openspec/specs/error-taxonomy/implementation.md` |
| 8 | `openspec/specs/calendar-context/spec.md`; `openspec/specs/calendar-context/implementation.md`; `openspec/specs/google-calendar-adapter/spec.md`; `openspec/specs/google-calendar-adapter/implementation.md`; `openspec/specs/microsoft-graph-adapters/spec.md`; `openspec/specs/microsoft-graph-adapters/implementation.md`; `openspec/specs/provider-actions/spec.md`; `openspec/specs/search-routing/spec.md`; `openspec/specs/realm-and-source-management/spec.md`; `docs/design/2026-07-13-context-access-layer.md` |
| 9 | `CONTEXT.md`; `openspec/specs/provider-actions/spec.md`; `openspec/specs/provider-actions/implementation.md`; `openspec/specs/profile-vocabulary/spec.md`; `openspec/specs/profile-vocabulary/implementation.md`; `openspec/specs/account-grant-management/spec.md`; `openspec/specs/microsoft-graph-adapters/spec.md`; `openspec/specs/microsoft-graph-adapters/implementation.md` |
| 10 | `openspec/specs/core-model/spec.md`; `openspec/specs/generic-storage/spec.md`; `openspec/specs/generic-storage/implementation.md`; `openspec/specs/retrieval-and-artifacts/spec.md`; `openspec/specs/retrieval-and-artifacts/implementation.md`; `openspec/specs/sync-operations/spec.md`; `openspec/specs/sync-operations/implementation.md`; `docs/design/2026-07-13-context-access-layer.md` |
| 11 | `openspec/specs/cli-surface/spec.md`; `openspec/specs/cli-surface/implementation.md`; `openspec/changes/agent-orientation-guidance/specs/cli-surface/spec.md`; `openspec/specs/error-taxonomy/spec.md`; `openspec/specs/error-taxonomy/implementation.md`; `openspec/specs/profile-vocabulary/spec.md`; `openspec/specs/extension-loading/spec.md`; `.agents/skills/repo-development/SKILL.md` |
| 12 | `openspec/specs/core-model/spec.md`; `openspec/specs/search-routing/spec.md`; `openspec/changes/agent-orientation-guidance/specs/search-routing/spec.md`; `openspec/specs/sync-operations/spec.md`; `openspec/specs/retrieval-and-artifacts/spec.md`; `openspec/specs/realm-and-source-management/spec.md`; `openspec/specs/extension-loading/spec.md`; `openspec/specs/provider-actions/spec.md`; `openspec/specs/calendar-context/spec.md`; `openspec/specs/google-calendar-adapter/spec.md`; `docs/design/2026-07-13-context-access-layer.md` |
| 13 | `.agents/skills/system-reference/SKILL.md`; the complete exact-path map in this table |

The remaining capability and sidecar evidence also contributes through the mapped cross-cutting sections: `openspec/specs/oauth-client-management/spec.md`, `openspec/specs/oauth-client-management/implementation.md`, `openspec/specs/secret-backend-operations/spec.md`, `openspec/specs/secret-backend-operations/implementation.md`, `openspec/specs/module-architecture/spec.md`, and `openspec/specs/module-architecture/implementation.md`. `openspec/specs/core-model/implementation.md` was not present and is not implied.
