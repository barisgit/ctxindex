## Why

ctxindex v1 was built as a local indexing CLI: sync sources into SQLite, search the index. Real agent usage (mail threads, attachment downloads, calendar lookups, ad-hoc provider queries, arbitrary user connectors) needs a broader contract: ctxindex is the source-of-truth interface through which agents discover, retrieve, and locally materialize personal context. Indexing is one implementation strategy, not the product definition. The redesign is fully decided and documented in `docs/design/2026-07-13-context-access-layer.md` (decisions D1–D19); this change tracks bringing the implementation to that design.

## What Changes

- **BREAKING** Storage collapses to six generic tables (`resources`, `field_index`, chunks+FTS, `relations`, `artifacts`, sync bookkeeping). Per-domain tables (`mail_messages`, `mail_bodies`, `mail_attachments`, `items`, ...) are removed; domain semantics move into profile payloads + field index.
- Profiles become the single mechanism for domain semantics: versioned `defineProfile` definitions declaring search fields, relations, exports, docs. Canonical profiles (`communication.message`, `communication.conversation`, `calendar.event`, `task`, `file`, `artifact`) are bundled definitions using the same public API.
- Extensions: in-process dynamic `import()` of TS/JS modules discovered under `~/.config/ctxindex/extensions/`, contributing adapters, profiles, and auth via `defineExtension`/`defineAdapter` factories with type-only SDK imports (compiled-binary safety verified by the D3 spike).
- Universal refs `ctx://<source-id>/<suffix>` for every resource, synced or ad hoc; ad-hoc retrievals are cached as `adhoc`-origin rows.
- Managed content-addressed artifact store with retention and purge; `download`/`export` verbs.
- Relations as lazily-resolved bidirectional edges (ref or natural-key targets) powering `thread get` (conversation membership + parent tree walk).
- Declarative auth kinds (oauth2, api-key, basic, none) run by core, plus namespaced secrets escape hatch.
- Search routing: hybrid orchestration by default, adapter decides per source; precedence CLI flag > source config > adapter hint.
- CLI verbs derived from registries (kinds, `--field`, adapter flags, `--format`); new verbs: `get`, `thread get`, `aggregate`, `artifact list|download`, `export`, `purge`, `install`, `extensions list`.

## Capabilities

Canonical requirement-level behavior lives in the root `SPEC.md` (already rewritten for the access layer). OpenSpec capability specs are created as thin, testable requirement sets per slice as implementation proceeds; they must reference, not duplicate, `SPEC.md` sections.

### New Capabilities

- `profile-vocabulary`: profile definitions, registries, versioning, unknown-profile degradation (SPEC §3a)
- `generic-storage`: six-table resource storage, payloads, field index, origin lifecycle (SPEC §3b, §4)
- `extension-loading`: discovery, dynamic import, capability declaration, removal semantics (SPEC §3d)
- `retrieval-and-artifacts`: get/thread/download/export, artifact store, retention (SPEC §10f)
- `search-routing`: hybrid orchestration, field filtering, aggregate (SPEC §10, §10e)

### Modified Capabilities

None yet in `openspec/specs/` — this is the first OpenSpec change; the v1 behavior baseline is `SPEC.md` + `V1.md`.

## Impact

- `packages/core`: schema migration replacing mail_*/items tables; new resource/field-index/relations/artifacts modules; sync runner emits resources via profiles.
- New packages: `@ctxindex/extension-sdk` (type-only public contract), `@ctxindex/profiles` (canonical profile definitions).
- `packages/adapters/google.mailbox` and `local.directory`: rewritten against the adapter contract (capabilities array, profile emission).
- `apps/cli`: registry-derived argument space; new verbs; exit codes unchanged (stable codes retained, needs_auth=10).
- Pre-work gates: the D3 compiled-extension spike passed on 2026-07-13 with Bun >=1.3.13 (the project pin moved to 1.3.14 because 1.3.12 failed); the remaining realms keep/cut verdict must land before the storage migration is written.
