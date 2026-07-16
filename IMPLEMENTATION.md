# ctxindex Implementation Notes

Status: draft

This document describes intended reference-implementation choices for `SPEC.md` and the V1 scope in `V1.md`. The repository's current code and local databases are disposable prototype scaffolding: implementation proceeds against a fresh schema with no compatibility or data-migration path.

## 1. Runtime and distribution

- Bun + TypeScript monorepo; Node is not a build target.
- Bun is pinned to 1.3.14 because compiled external-TypeScript loading fails on 1.3.12 and passes on 1.3.13/1.3.14.
- Distribution remains a single executable built with `bun build --compile`; compiled binaries apply ordered manifests that embed the canonical migration SQL.
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

## 7. Storage

SQLite + Drizzle remains the local storage stack. V1 creates a fresh core schema; no adapter owns migrations or tables.

Storage areas:

```text
resources                 envelope, primary Profile id/version, payload, origin
field_index               ordered rows with one native typed value column
chunks + FTS              searchable text
relations + resolutions   logical Ref/string-natural-key edges and zero-to-many matches
artifacts                 content-addressed metadata and local path
sources/sync bookkeeping  Accounts, Grants, Realms, Sources, cursors, runs, locks
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

A Source binds exactly one Adapter, one Realm, one config payload, and when required one compatible Grant. Sync enablement is Source configuration, not Source identity.

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

Both require an explicit mailbox Source. The host validates input before provider I/O; the Adapter persists the provider Draft and returns a normalized `communication.message` Resource/Ref. Gmail Draft Refs use `ctx://<source-id>/draft/<immutable-draft-id>` because Gmail replaces the embedded Message id on update. Update input addresses that Ref and supplies complete replacement recipients, subject, and body. Gmail remote message discovery excludes Draft-labelled messages to prevent a second message-id identity for the same Draft. The Gmail Adapter and OAuth Grant require `gmail.readonly` plus `gmail.compose`, but no send binding exists. A Draft is reversible provider state. Message sending and irreversible action execution are not implemented in V1.

The generic CLI shape is:

```text
ctxindex action describe <action-id> [--source <id>]
ctxindex action run <action-id> --source <id> --input <json-or-file> [--json]
```

No bespoke `mail draft` command is maintained in parallel.

## 11. CLI derivation

The loaded registries determine valid kinds/aliases, field names and parsers, Source configuration flags, export formats, and Actions. `ctxindex describe` exposes the same machine-readable facts used to build CLI help and agent docs.

All required input is non-interactive. OAuth may open a browser but has a headless authorization-code path. Human text goes to stderr when structured output is requested; JSON data goes to stdout.

## 12. Testing

- Bun's built-in test runner; tests live beside source as `*.test.ts`, `*.integration.test.ts`, and `*.e2e.test.ts`.
- Every storage/integration test creates a fresh sandboxed database.
- Provider tests use mocked authorized HTTP; optional live Gmail checks remain separate.
- Contract tests instantiate bundled and external definitions through the same public SDK.
- Architecture checks keep provider HTTP and SQL out of `apps/cli`.
- The D3 compiled-extension spike runs in CI.

Implementation follows the vertical slices in `V1.md`; no slice starts by reproducing the prototype schema or preserving prototype behavior.
