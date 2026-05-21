# ctxindex Reference Study

Status: notes from BTCA local reference study. This document is non-normative; promote decisions into `SPEC.md` or `IMPLEMENTATION.md` when locked.

## References inspected

- Traul — `/Users/blaz/.local/share/btca-local/repos/github.com__dandaka__traul__e2aed1ab` (`main`, `4de8dc81b1ee`)
- mxr — `/Users/blaz/.local/share/btca-local/repos/github.com__planetaryescape__mxr__6fd3e6de` (`main`, `751f56fc29f6`)
- recallr — `/Users/blaz/.local/share/btca-local/repos/github.com__flowdesktech__recallr__306d8552` (`master`, `c48e225cc0c8`)
- msgvault — `/Users/blaz/.local/share/btca-local/repos/github.com__wesm__msgvault__c96f2693` (`main`, `31098c3fdbd8`)
- ownmail — `/Users/blaz/.local/share/btca-local/repos/github.com__clee704__ownmail__f5caa7dc` (`master`, `f6c86e561cb6`)
- qi — `/Users/blaz/.local/share/btca-local/repos/github.com__itsmostafa__qi__e4967db2` (`main`, `0e01f253d981`)
- Housaku — `/Users/blaz/.local/share/btca-local/repos/github.com__dnlzrgz__housaku__e0c646b1` (`master`, `94a838fbd84a`)

## Strongest reusable patterns

### Source adapter contract

- Traul uses a minimal connector interface with `name`, `sync(db, config)`, optional `defaultInterval`, and optional `hasCredentials`.
- recallr uses an async-generator connector interface: connectors stream normalized messages through `async *fetch()` and the indexer batches persistence.
- mxr uses explicit provider traits and opaque provider-owned cursors.

Implication for ctxindex: keep the typed operation boundary, but make adapter output streamable:

```ts
type SourceAdapter = {
  id: SourceAdapterId;
  hasCredentials?(ctx: AdapterContext): Promise<boolean>;
  sync(ctx: SyncContext): AsyncIterable<SyncOperation> | Promise<SyncResult>;
};
```

Core should still own core-table writes and cursor advancement.

### Sync lifecycle

Common reliable pattern:

1. read source cursor/checkpoint;
2. fetch remote/local changes;
3. write normalized records and adapter-owned state inside a transaction;
4. update FTS/search index;
5. advance cursor only after durable writes and index updates;
6. record sync outcome.

msgvault's `sync_runs` lifecycle is the strongest reference: start, checkpoint, complete/fail, counts, errors, cursor before/after. mxr adds a useful guarantee: lexical search is fresh when sync returns; semantic work can happen later.

Implication for ctxindex: add `sync_runs` and `sync_run_checkpoints` early, not later.

### Search architecture

- Traul: SQLite FTS5 + sqlite-vec, RRF hybrid merge with `k=60`, `like` fallback, FTS query sanitization.
- recallr: SQLite FTS5 + dense vectors as Float32 BLOBs, JS cosine rerank, hybrid fusion, lexical fallback when embedding fails.
- qi: SQLite FTS5, content-addressable chunks, three-pass query relaxation, RRF, `--explain` score output.
- mxr: lexical search is mandatory/fresh; semantic chunks and embeddings are optional platform state.

Implication for ctxindex:

- FTS/BM25 must be the always-available baseline.
- Vector search should be optional and chunk-based.
- Hybrid search should use RRF with `k=60` as the first default.
- Search should return items plus best matching chunks/snippets.
- Add `--explain` early for debugging ranking.

### Local directory indexing

qi is the strongest local directory reference:

- content hash for change detection;
- content-addressable storage;
- named collections/sources;
- breakpoint chunker with headings/code fences/blank lines;
- default ignore directories;
- soft delete/reactivation;
- index run audit table.

Housaku is useful for simple TOML config, file/RSS indexing, and TUI/web ideas, but its mtime-only change detection and no-migration design should not be copied.

Implication for ctxindex: local.directory should use content hash, default ignores, extractor version, and source-level run audit from v1.

### Mail archive model

msgvault is the strongest mail data-model reference:

- separate message metadata, bodies, raw MIME, attachments;
- `rfc822_message_id` as an important cross-mailbox reference;
- content-addressed attachment storage;
- account identities for sent/from-me detection;
- explicit cross-account/collection scope for dedup;
- structured search query operators.

ownmail is useful as a contrast: `.eml` source-of-truth, SQLite FTS5 index, keychain credentials, integrity verification. It supports the ctxindex decision to keep export/file backup as a separate feature rather than primary storage.

### Config and secrets

- qi and Housaku both use XDG-ish config/data locations.
- ownmail's `keychain:` secret references are a good user-facing pattern.
- mxr uses keychain abstraction and keeps tokens out of config.
- Traul/recallr use env var overrides for setup convenience.

Implication for ctxindex: TOML desired state should allow secret refs and env overrides:

```toml
[[sources]]
id = "gmail-personal"
adapter = "google.mailbox"
grant = "keychain:ctxindex/google/blaz@example.com/gmail-read"
```

### Runtime surfaces

- recallr and msgvault expose MCP; recallr keeps MCP tools small (`search_messages`, `get_message`, `get_thread`, `status`).
- mxr shows the value of a daemon/socket architecture, but it is a larger system.
- Traul has a local health endpoint and daemon scheduler.

Implication for ctxindex:

- v1 can stay CLI/library-first.
- Design core APIs so a daemon/MCP can be added without rewriting sync/search.
- Keep machine-readable JSON output on every read command.

## Patterns to avoid

- Do not make semantic/vector failures break lexical search.
- Do not put secrets in SQLite or TOML; store secret refs only.
- Do not rely on mtime alone for local files.
- Do not use `INSERT OR REPLACE` around rows with foreign keys; use `ON CONFLICT DO UPDATE`.
- Do not make adapter-specific tables replace normalized item/chunk/tombstone emission.
- Do not start with a complex cross-account dedup engine; require explicit collection scope before dedup across sources.
- Do not make a daemon mandatory in v1 unless background sync becomes a real requirement.

## Recommended promotions into ctxindex docs

1. Add `sync_runs` / checkpoint model to `SPEC.md` and `IMPLEMENTATION.md`.
2. Clarify adapter sync output as streamable operations, not necessarily an array.
3. Add search ranking defaults: FTS baseline, optional vectors, RRF `k=60`, `--explain`.
4. Add local.directory implementation details: content hash, default ignore dirs, extractor version, index run audit.
5. Add mail implementation details: separate metadata/body/raw/attachment concepts, `rfc822_message_id` external ref, account identities.
6. Keep daemon/MCP as future surfaces, not v1 requirements.

## Highest-value files to read next

Traul:

- `src/db/schema.ts`
- `src/db/database.ts`
- `src/connectors/types.ts`
- `src/lib/chunker.ts`
- `src/lib/embeddings.ts`

mxr:

- `crates/core/src/provider.rs`
- `crates/sync/src/engine.rs`
- `crates/daemon/src/loops.rs`
- `crates/store/src/pool.rs`
- `docs/blueprint/04-sync.md`
- `docs/blueprint/05-search.md`

recallr:

- `src/types.ts`
- `src/store/sqlite.ts`
- `src/indexer.ts`
- `src/mcp/server.ts`
- `src/connectors/imap.ts`

msgvault / ownmail:

- `internal/store/schema.sql`
- `internal/store/sync.go`
- `internal/importer/ingest.go`
- `internal/search/query.go`
- `ownmail/config.py`
- `ownmail/providers/base.py`

qi / Housaku:

- `qi/internal/db/migrations/001_init.sql`
- `qi/internal/search/bm25.go`
- `qi/internal/search/fusion.go`
- `qi/internal/chunker/breakpoint.go`
- `qi/internal/indexer/indexer.go`
- `housaku/src/housaku/feeds.py`
