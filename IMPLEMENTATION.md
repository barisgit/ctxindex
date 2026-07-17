# ctxindex Implementation Notes

Status: draft

This document describes intended reference-implementation choices for `SPEC.md` and the milestone scopes in `V1.md` and `V1_1.md`. The repository's current code and local databases are disposable prototype scaffolding: implementation proceeds against a fresh schema with no compatibility or data-migration path.

## 1. Runtime and distribution

- Bun + TypeScript monorepo; Node is not a build target.
- Bun is pinned to 1.3.14 because compiled external-TypeScript loading fails on 1.3.12 and passes on 1.3.13/1.3.14.
- Distribution remains a single executable built with `bun build --compile`; compiled binaries apply ordered manifests that embed the canonical migration SQL and bundled skills.
- External Extensions are trusted in-process modules loaded with dynamic `import()`.
- `scripts/spikes/d3-compiled-extension/run.sh` is the permanent loader regression check.

## 2. Package boundaries

```text
apps/cli                    thin argument/output shell
packages/core               orchestration, registries, storage, auth, search
packages/extension-sdk      public authoring types and pure definition factories
packages/profiles           bundled canonical Profile definitions
packages/adapters           bundled provider implementations
```

`apps/cli` parses arguments, invokes core services, formats results, and maps typed errors to stable exit codes. It contains no provider HTTP, SQL, identity generation, or domain behavior.

Module ownership follows behavior: the Extension SDK owns public authoring contracts and pure definition factories; Profiles own provider-neutral schemas and semantic projections; Adapters co-locate provider configuration, operations, transport helpers, and provider-specific tests; core owns registries, orchestration, and every SQLite table/migration. Tests stay with the owning module unless they intentionally exercise a repository-level package integration contract, in which case they live under `scripts/verify/`. Workspace dependencies point only toward those lower public seams; the repository verifier enforces this direction and direct runtime dependency declarations across production and colocated test files.

## 3. Definition model

The public authoring surface consists of pure factories:

```ts
defineProfile({...})
defineAdapter({...})
defineExtension({...})
```

Definitions are plain versioned objects. Registries use const-generic tuples for authoring inference, erase to runtime-safe definition interfaces inside core, reject duplicate `(id, version)` pairs, and validate all dynamically loaded definitions before activation. Runtime binding never relies on object identity or `instanceof` across package copies.

Profiles declare payload schemas and pure vocabulary for search extraction, typed fields, Relations, Artifact descriptors, exports, docs, and typed Action contracts. Adapters implement provider I/O. Extensions only bundle definitions.

## 4. Extension loading

V1 first supports explicit Extension paths, then adds auto-discovery under:

```text
~/.config/ctxindex/extensions/*.ts
~/.config/ctxindex/extensions/*/index.ts
```

Built-ins load first and win id conflicts with a diagnostic. Extensions may have their own `node_modules`, but they do not import ctxindex runtime code. Type-only SDK/profile imports are erased; runtime facilities arrive through host-provided operation contexts.

An invalid Extension is rejected as a unit. If a previously available Extension disappears, its Sources become unavailable while locally materialized Resources remain searchable.

## 5. Operation contexts

Adapters receive capability-specific contexts rather than one unrestricted host object:

```text
SyncContext       Source/config/cursor, authorized fetch, logger, cancellation, emit sink
SearchContext     Source, normalized query/filters/limits, authorized fetch, logger
RetrieveContext   Source, Ref, authorized fetch, logger, Resource/Artifact sinks
DownloadContext   Source, Artifact identity, authorized fetch, byte sink, logger
ActionContext     Source, validated Action input, authorized fetch, logger, cancellation
```

Shared facilities are namespaced and least-surface: authorized provider fetch, scoped logger, Source metadata, namespaced secrets escape hatch, Artifact sink, and cancellation signal. Profiles receive no operation context; their ordinary vocabulary remains pure.

## 6. Adapter operations

Adapter declarations pair capabilities with implementations:

```text
sync           cursor-driven emission of Resources, Relations, and tombstones
searchRemote   provider query returning normalized envelope-level Resources
retrieve       complete one Resource by Ref
download       stream Artifact bytes
actions        map Profile Action ids to provider implementations
```

There is no standalone `emit` capability. Sync, retrieval, remote search, and Actions return or emit normalized operations through their contexts. Declaring an operation without an implementation, or implementing one without declaring support, is a registry validation error.

Built-in calendar Adapters use indexed sync plus exact Ref retrieval and expose
no Actions. Each Source selects one calendar and rolling window. Google stores
an opaque sync token after a complete bounded scan; Microsoft uses a final
opaque delta link for the default calendar and complete paged scans for named
calendars. Both retain a Source-local manifest so only explicit removals or a
completed reconciliation can delete local Resources. Provider response and
cursor rules remain in their Adapter modules; the shared calendar Profile owns
event semantics.

## 7. Storage

SQLite + Drizzle remains the local storage stack. V1 creates a fresh core schema; no adapter owns migrations or tables.

Storage areas:

```text
resources                 envelope, primary Profile id/version, payload, origin
field_index               ordered rows with one native typed value column
chunks + FTS              searchable text
relations + resolutions   logical Ref/string-natural-key edges and zero-to-many matches
artifacts                 content-addressed metadata and local path
oauth_clients             provider-scoped labels, typed credential refs, timestamps
sources/sync bookkeeping  labeled Accounts/Sources, one Grant per Account, Realms, cursors, runs, locks
```

`field_index` stores a ULID, Resource id, field name, declared type, ordinal,
and exactly one typed value: TEXT for string values, REAL for numbers, or
INTEGER for booleans and UTC-millisecond datetimes. Scalars use ordinal zero;
array elements use contiguous ordinals. Partial typed indexes support equality,
aggregation, and number/date ranges without casts. Resource writes replace
derived field/chunk projections transactionally. `synced` rows participate in
deletion/tombstone semantics; `adhoc` rows are purgeable cache entries and are
never tombstoned.

Refs are validated as `ctx://<26-character Source ULID>/<suffix>`. The encoded
suffix is non-empty, at most 16 KiB, and uses RFC 3986 path characters plus
uppercase percent escapes. Core preserves it byte-for-byte and never assigns
provider meaning to it. Source availability is derived by comparing its bound
Adapter id/version with the loaded registries; it is not a sync status.

Natural-key Relations use string `(field, value)` targets in V1. A separate
resolution mapping caches zero-to-many matches globally across Sources and
Realms; the logical edge remains observable when no match exists.

Artifact bytes live under the ctxindex data directory by content hash. SQLite stores a stable Artifact Ref, owning Resource, origin Ref, media type, size, fixed `cached` retention class, and relative path. V1 retains cached bytes indefinitely: only explicit `purge artifacts` removes managed bytes and cache metadata, while Resource payloads and Profile-derived descriptors remain for re-download. There is no automatic age-, quota-, or pressure-based eviction. `--output` copies bytes out without transferring store ownership.

## 8. Realms and Sources

Realms are ordinary user-defined rows; initialization does not seed a `global` Realm. Source creation requires an explicit existing Realm. Unfiltered search spans all Realms; filtered search uses exactly the requested Realm set.

A Source binds exactly one Adapter, one Realm, one config payload, and when required one compatible Grant. It carries one globally unique verbatim label, replacing a separate display name. Without `--label`, the default is `<account-label>-<adapter-tail>` or `<adapter-tail>` when no Account is required. Sync enablement is Source configuration, not Source identity.

## 8a. Secrets, Accounts, and provider authorization

A routing Secret Vault resolves reads/deletes by typed `keychain:` or `file:` reference and sends new writes only to the backend persisted in config. Fresh initialization probes Keychain once and persists either Keychain or an explicitly prepared encrypted-file backend. Backend changes use copy-first, reference-update, atomic-config, then cleanup ordering; mixed references remain readable during interruption. Secret values and passphrases never enter argv.

Accounts use a unique stable `(provider, external_user_id)` subject and a globally unique verbatim local label defaulting to the verified provider identity. Mutable verified email/principal values live in `account_identities`. Each Account owns one stable Grant whose exact normalized scopes and secret references are updated in place on reauthorization; Sources retain explicit compatible Grant ids. One Account module owns upsert, removal, and nested inventory SQL.

OAuth Adapter declarations carry a stable provider id, endpoint/identity JSON-path metadata, PKCE/client mode, provider base scopes, safe environment names, and allowed hosts. `client add <provider> --from-env` reads those declared environment names once, stores credentials through the configured secret backend, and persists provider-scoped labeled Client metadata; runtime authorization never consults the environment. `account add` resolves one persisted Client for the provider and requests provider base scopes plus the sorted union of all loaded same-provider Adapters. One core host flow owns loopback authorization, state/PKCE, token/identity validation, refresh rotation, stable Account/Grant persistence, and cleanup. Provider response schemas and Resource normalization remain in provider-owned Adapter modules.

## 9. Search and retrieval

Search normalizes one query/filter model, plans local and provider origins per Source, and merges warnings without losing successful local results. Local BM25 and provider relevance scores are ranked within their origins and interleaved rather than compared numerically.

`get` resolves a Ref locally first, then calls `retrieve` when needed and stores the result as ad-hoc materialization. `thread get` traverses both conversation membership and parent Relations. Provider-specific thread ids never become core-only semantics.

## 10. Typed Actions and Drafts

A Profile Action definition contains a stable id, input schema, output contract, effect classification, docs, and examples. An Adapter binds implementations only for Actions declared by Profiles it supports. `describe` and Action CLI arguments derive from these definitions.

V1 implements only:

```text
communication.message.draft.create
communication.message.draft.update
```

Both require an explicit mailbox Source. The host validates input before provider I/O; the Adapter persists the provider Draft and returns a normalized `communication.message` Resource/Ref. Gmail Draft Refs use `ctx://<source-id>/draft/<immutable-draft-id>` because Gmail replaces the embedded Message id on update. Outlook Draft Refs use the Microsoft Graph message id returned under `Prefer: IdType="ImmutableId"` on every relevant request. Update input addresses that Ref and supplies complete replacement recipients, subject, and body. Mailbox search excludes provider Drafts to prevent a second message identity. Gmail requires `gmail.readonly` plus `gmail.compose`; Microsoft requires delegated `Mail.ReadWrite`; neither binds send, requests `Mail.Send`/a send-only permission, exposes a send route, or retries a mutation automatically. A Draft is reversible provider state. Message sending and irreversible action execution remain unimplemented.

The generic CLI shape is:

```text
ctxindex action describe <action-id> [--source <id>]
ctxindex action run <action-id> --source <id> --input <json-or-file> [--json]
```

No bespoke `mail draft` command is maintained in parallel.

## 11. CLI derivation

The loaded registries determine valid kinds/aliases, field names and parsers, Source configuration flags, export formats, and Actions. `ctxindex describe` exposes a compact generated index, selector-only forms narrow that index, exact-id forms expose full readable or JSON detail, and explicit `--full` requests the complete snapshot. Citty help points to this interface instead of appending all loaded definitions.

All required input is non-interactive. OAuth Client credentials enter only through `client add --from-env` and are persisted as typed secret references; `account add` performs authorization with the persisted Client. Codes, tokens, client secrets, and secret-store passphrases are never literal command arguments. Human text goes to stderr when structured output is requested; JSON data goes to stdout.

## 12. Testing

- Bun's built-in test runner; tests live beside source as `*.test.ts`, `*.integration.test.ts`, and `*.e2e.test.ts`.
- Every storage/integration test creates a fresh sandboxed database.
- Provider tests use stateful loopback-only authorized HTTP for Google and Microsoft; optional live checks remain isolated Human checkpoints.
- Contract tests instantiate bundled and external definitions through the same public SDK.
- Architecture checks keep provider HTTP and SQL out of `apps/cli`.
- The D3 compiled-extension spike runs in CI.

Implementation follows the vertical slices in the active milestone; no slice starts by reproducing the prototype schema or preserving prototype behavior.
