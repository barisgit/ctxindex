# ctxindex redesign: personal context access layer

Status: draft design (pre-spec). Supersedes the product framing in `CONTEXT.md` and
parts of `SPEC.md` §1/§3 once accepted. Decisions here were resolved in a design
grill session on 2026-07-13; each carries its rationale and its reversibility.

## 1. Product reframe

> **ctxindex is the source-of-truth interface through which agents discover,
> retrieve, and locally materialize a person's context — mail, calendars, tasks,
> files, and arbitrary connector domains. Indexing is one implementation
> strategy for fast local discovery, not the product definition.**

Three core capabilities over the same configured sources:

1. **Discover** — search indexed data fast; optionally search providers live;
   return stable refs, metadata, snippets.
2. **Retrieve** — fetch a complete message, thread, event, file, or task;
   download attachments and original representations; ad hoc, without requiring
   the source to be synced.
3. **Sync** — maintain searchable local projections of selected sources with
   optional artifact retention.

Ad hoc retrieval and sync are two access modes over one source concept, not two
products. Agent workflow policy (digest composition, triage rules, unsubscribe
safety) stays OUT of ctxindex — it lives in agent skills that call the CLI.

Division of labor with the surrounding ecosystem:

- **ctxindex**: auth, provider access, sync, search, retrieval, download/export,
  deterministic JSON output.
- **Agent skills** (e.g. the Hermes `context-hub` skill this replaces): workflow
  policy over the CLI.
- **ACF** (`../agent-capability-format`): future distribution of agent-facing
  skill docs. ctxindex extension packages therefore bundle adapters/profiles
  ONLY, not skills. The existing `ctxindex skills` surface remains for bundled
  docs but is expected to be superseded by ACF emission.

Explicitly out of scope (unchanged): SaaS/remote canonical store, write-back to
providers, universal sync protocol. Newly IN scope (reverses current SPEC §1):
dynamic loading of user extensions; export of items/threads/attachments as files.

## 2. Decision log

| # | Decision | Choice | Notes |
|---|----------|--------|-------|
| D1 | Extension power | Adapters with open `kind`/profiles, canonical operations. No arbitrary CLI subcommands | Revisit arbitrary commands only with demonstrated need |
| D2 | Extension loading | In-process dynamic `import()` of TS/JS, full trust, factory-receives-API | Bun executes TS natively; out-of-process protocol deferred |
| D3 | Binary distribution | Compiled Bun binary retained; extensions never import runtime code — type-only imports + host-provided API object | Verified with Bun 1.3.13/1.3.14; 1.3.12 fails, so the project is pinned to 1.3.14. Repeatable spike at `scripts/spikes/d3-compiled-extension/` |
| D4 | Universal ref | `ctx://<source-id>/<adapter-opaque-suffix>` for every resource, indexed or not | Provider-native URIs kept as metadata |
| D5 | Auth ownership | Declarative specs (oauth2/api-key/basic/none) run by core + minimal namespaced secret bucket as escape hatch | OAuth refresh, `needs_auth`, exit 10 stay uniform |
| D6 | Source concept | Source = configured connection; sync is optional per-source | One noun; `source add --no-sync` |
| D7 | Search default | Hybrid orchestration; adapter decides per source with sync-coverage knowledge; `--local-only` / `--remote` override | PROVISIONAL — validate by dogfooding partial Gmail sync |
| D8 | Artifacts | Managed content-addressed store with retention policy, purge, `--output` copies out | |
| D9 | Data shape | Minimal resource envelope + profiles; arbitrary payload allowed | |
| D10 | Profile composability | Permitted by API; v-next uses one primary profile (+ `artifact`) per resource | |
| D11 | Definition style | Declarative `defineExtension`/`defineAdapter`/`defineProfile` factories; typed registries internally | pi-style authoring, lume/sessionloom-style registries |
| D12 | Unknown profile version on emit | Accept envelope-only, index degraded, warn | Matches provider-failure philosophy |
| D13 | Storage | Six generic core tables; NO per-profile tables, NO adapter-private tables in v-next | `ctx.storage` is a future additive API |
| D14 | Relations | Bidirectional edges; targets are `ctx://` ref OR natural key (lazy resolution) | Order-independent threading, cross-source joins |
| D15 | Exports | Vocabulary slot on profiles (`format -> render`); generic core verb; no conversion pipeline | |
| D16 | Capabilities | Const array of enum flags: `["sync", "search-remote", "retrieve", "download"]`; search MODE moves to routing | |
| D17 | Distribution | Local paths in config + auto-discovery dir now; git later; npm deferred; possibly reuse ACF resolver | |
| D18 | CLI dynamism | Generic verbs derive their whole argument space from registries (kinds, fields, formats, adapter flags from config schemas). NO parallel command/alias declarations. Typed subcommand registration through the registry machinery is the only future alternative (deferred) | Derive, never declare twice |
| D19 | Docs | Definitions are self-documenting: `docs` fields, kind `aliases`, schema `.describe()` in the SDK contract from day one; `ctxindex describe` renders registry-derived docs; bundled skill docs mostly generated | Implementation deferred; contract fields not |

## 3. Concept model (10 nouns)

- **Ref** — `ctx://<source-id>/<opaque-suffix>`; stable locator for a resource,
  independent of whether it is indexed. Adapter owns the suffix. If a remote
  hit is later synced, the same ref resolves to the local row.
- **Resource** — one unit of context (message, event, task, file, tender) as an
  envelope + validated profile payload(s). The envelope `kind` IS the primary
  profile id; user-facing aliases (`mail` → `communication.message`) are a
  CLI-level alias table, not a separate concept.
- **Profile** — versioned, schema-backed declaration of a domain shape plus the
  vocabulary core needs (search mapping, fields, relations, artifacts, exports).
  The ONLY mechanism for domain semantics. Canonical profiles are bundled
  profile definitions using the same public API as extension profiles.
- **Adapter** — connects one provider collection type; declares capabilities,
  auth, config schema, emitted profiles; implements `sync` / `searchRemote` /
  `retrieve` / `download` per its capability flags.
- **Extension** — distributable module providing profiles and adapters via
  `defineExtension`. Built-ins are extensions bundled with the binary; same
  contract, no privileged path. Privileges are distributional only (always
  present, loaded first, win id conflicts).
- **Source** — one configured connection instance (account, realm, config,
  sync on/off) using exactly one adapter.
- **Sync run** — cursor-driven materialization of a source (existing model:
  locks, runs, checkpoints, tombstones — unchanged).
- **Artifact** — downloadable bytes (attachment, original record, rendered
  export) in the content-addressed store.
- **Relation** — typed edge between resources; target may be a ref or a
  natural key awaiting resolution.
- **Field index** — generic typed index rows extracted from declared profile
  fields; powers filters and aggregation.

Dependency DAG:

```
Extension ─provides─> ProfileDef ─> ProfileRegistry ─vocabulary─> QueryPlanner
    │                     ▲                                          ▲
    └─provides─> AdapterDef (emits profiles, declares AuthSpec) ────┐│
                      │                                             ││
                 AdapterRegistry ─> Source (account, realm, sync?)  ││
                      │                   │                         ││
                      │            ┌──────┴────────┐                ││
                      │         SyncRun         AdHocCall           ││
                      │            └──────┬────────┘                ││
                      └────emit────> Resource(ref, envelope,        ││
                                     profile payloads) ────────────>┘│
                                       │        │                    │
                              FieldIndex+FTS  ArtifactDescriptor     │
                              Relations         │                    │
                                       │     ArtifactStore (CAS)     │
                                       ▼        ▼                    │
                    CLI: search/aggregate/get/thread/artifact/export/sync/status
```

## 4. Core vs vocabulary: the smart-runtime rule

**Core knows the vocabulary, never the domains.** Core never contains the word
"mail". It implements mechanics: query planning, FTS, field indexes, relation
traversal (both directions), artifact retention, sync locking, auth flows,
registries, routing.

Profile vocabulary slots (v-next, each versioned):

```ts
defineProfile({
  id: "communication.message",
  version: 1,
  schema: z.object({ ... }),          // payload validation, types derive from it
  search: {
    title: (p) => ...,                 // string | null
    occurredAt: (p) => ...,           // Date | null
    chunks: (p) => ...,               // string[] for FTS
    fields: {                          // TYPED declarations, not bare extractors
      sender:  { type: "string[]", extract: (p) => ... },
      unread:  { type: "boolean",  extract: (p) => ... },
      cpv:     { type: "string[]", extract: (p) => ... },
    },
  },
  relations: {
    conversation: (p) => p.conversationRef,             // ref | natural key | null
    parent:       (p) => p.inReplyToRef,                // reply-tree edge
  },
  artifacts: (p) => p.attachments,     // descriptors; bytes fetched lazily
  exports: {
    eml: { mediaType: "message/rfc822", render: renderEml },
  },
})
```

Rules:

1. **Purity** — vocabulary functions are pure over the validated payload. No
   I/O. Anything needing I/O belongs in the adapter. Exception: `render` for
   multi-resource exports receives declared deps (e.g. "related resources by
   relation R"), resolved by core.
2. **Versioned slots** — a binary ignoring an unknown slot emits a diagnostic
   and continues (same policy as D12). Old cores tolerate new vocabulary; new
   cores give old profiles more capability.
3. **Degraded acceptance (D12)** — unknown profile id/version at emit: store
   envelope, index what the envelope carries, warn in sync run + status.

Canonical profiles bundled with the binary: `communication.message`,
`communication.conversation` (carries the `mbox` export, whose render deps
request members via the inverse `conversation` relation), `calendar.event`
(carries `ics` export), `task`, `file`, `artifact`.
Forcing function: **if the mail profile cannot be expressed through the public
profile API, the API is too weak.**

## 5. Storage (D13)

Six generic tables replace all per-domain tables:

| Table | Contents |
|---|---|
| `resources` | ref, source_id, realm_id, primary profile id+version, title, occurred_at, updated_at, deleted_at, origin (`synced` \| `adhoc`), payload JSON |
| `field_index` | (resource_id, field, type, value) rows from declared fields |
| `chunks` (+FTS) | searchable text segments |
| `relations` | (from_resource, relation, target_ref?, target_field?, target_value?, resolved_resource_id?) |
| `artifacts` | CAS metadata: hash, media type, size, origin ref, retention class, local path |
| `sources` + existing sync bookkeeping | unchanged: sync_runs, sync_locks, source_sync_state, tombstones, accounts, grants, realms |

DELETED from the current design: `mail_messages`, `mail_bodies`,
`mail_attachments`, per-adapter migration namespaces for canonical data,
adapter-private tables. Escape valves until a future `ctx.storage` API: cursor
JSON (sync state) and the artifact store (blobs).

Ad hoc caching: `retrieve` results are cached into the SAME tables with
`origin: adhoc`, so `download` after `get` does not re-fetch, refs never
dangle, and repeated agent queries hit disk. Remote SEARCH hits cache
envelope-only rows (ref, title, times, snippet chunk) without a validated
payload; a subsequent `get` triggers `retrieve` and fills the payload. `purge
adhoc` evicts by origin class. A later sync of the same ref upgrades the row
to `synced`. Tombstones apply only to synced rows; adhoc rows are cache
entries and are evicted, never tombstoned.

## 6. Relations and threading (D14)

Edge targets: `ctx://` ref OR natural key `(field, value)` — e.g.
`(internetMessageId, "<abc@x>")`. Core stores unresolved edges and resolves
lazily: on arrival of a matching resource (via field index) or at query time.
Dangling edges are legal and queryable as unresolved. Relations are indexed in
both directions; "resources related to X by R" is a query primitive.

`thread get <ref>`: union of provider `conversation` membership and `parent`
reply-tree walk (both directions); tree when headers exist, flat fallback
otherwise. Cross-source: shared message-ids join threads spanning mailboxes.

## 7. Refs (D4)

Grammar: `ctx://<source-id>/<adapter-opaque-suffix>`. Source id routes;
suffix is adapter-owned and opaque to core. Artifact refs extend the resource
ref (`.../doc/razpisna.pdf`) — still adapter-owned. Provider-native URIs
(`https://mail.google.com/...`) are envelope metadata for humans, never input.

## 8. Capabilities, auth, routing

### Capabilities (D16)

```ts
capabilities: ["sync", "search-remote", "retrieve", "download"] as const
```

All flags boolean. Conditional types narrow the adapter definition: declaring
`"sync"` requires the `sync` generator; omitting it forbids it. Same for
`searchRemote`, `retrieve`, `download`.

### Auth (D5)

```ts
auth: { kind: "oauth2", provider: { authUrl, tokenUrl }, scopes: [...] }
auth: { kind: "api-key", label: "Fastmail API token" }
auth: { kind: "basic" } | { kind: "none" } | { kind: "custom" }
```

Core runs declarative flows, stores secrets, refreshes tokens, surfaces
`needs_auth` (exit 10) uniformly, hands adapters a pre-authorized `ctx.fetch`.
`custom` grants only `ctx.secrets.get/set` (namespaced); `auth list` shows it
as custom-managed.

### Search routing (D7, provisional)

Precedence: CLI flag (`--local-only` / `--remote`) > per-source config >
adapter decision. Default is hybrid orchestration: each source answers per its
adapter's routing choice, which may consult sync coverage (fully mirrored →
local only; partial/none → include remote). Remote failures degrade to the
existing warning envelope; local results still return. Per-query remote
timeout degrades stragglers to warnings.

## 9. Extension SDK and loading (D2/D3/D11)

**D3 result — passed (2026-07-13, requires Bun >=1.3.13).** A relocated
`bun build --compile` executable, launched from `/`, dynamically imported an
external `.ts` extension through a `file:` URL. The extension used TypeScript
syntax, a type-only authoring import, a relative `.ts` runtime import, its own
`node_modules` dependency, and the host-provided factory API. The retained
regression check is `scripts/spikes/d3-compiled-extension/run.sh`. Bun 1.3.12
was killed with exit 137 at dynamic import; 1.3.13 and 1.3.14 passed. The root
toolchain pin is therefore Bun 1.3.14.

Authoring — top-level pure factories, pi-style:

```ts
import { defineAdapter, defineExtension, defineProfile } from "@ctxindex/extension-sdk";
import { communication } from "@ctxindex/profiles";  // typed descriptors of bundled profiles
```

- Factories return plain versioned definition objects; no module-level mutable
  state, no `instanceof` across package copies. Binding is by `(id, version)`.
- `@ctxindex/extension-sdk` and `@ctxindex/profiles` are types+schemas
  packages for authoring DX; runtime values (zod instance, logger, authorized
  fetch, secrets, artifact sink) arrive via the host-provided context objects,
  so the compiled binary stays sealed and never duplicates core.
- Extensions may have their own `node_modules` for their own deps.
- Internals mirror lume/sessionloom patterns: const-generic registries
  (`createProfileRegistry([...] as const)`, `createAdapterRegistry`) inferring
  id unions from definition tuples, duplicate detection, runtime schema
  validation of dynamically loaded definitions, type-erased `AnyAdapter` /
  `AnyProfile` surfaces inside core.

Loading: auto-discovery from `~/.config/ctxindex/extensions/*.ts` and
`*/index.ts`, plus explicit paths in config. Full trust (documented). Built-in
extensions load first; id conflicts resolve to built-ins with a diagnostic.

Removal/absence semantics: when an extension is uninstalled or fails to load,
its sources become `unavailable` (listed, not searchable remotely, no sync);
their synced resources REMAIN searchable via the envelope and field index
(payload and vocabulary still validate against the last-known profile only if
the profile came from the missing extension — in that case degrade to
envelope-level behavior, D12 policy). `source remove` / `purge source` remain
the explicit data-deletion paths; removing code never silently deletes data.

Distribution (D17): local paths now; `git:` sources later; npm deferred;
evaluate reusing the ACF resolver (`capabilities.yml`-style fetch + lockfile)
before building bespoke fetch logic.

## 10. CLI surface (target)

```text
ctxindex init
ctxindex auth add <provider> | list
ctxindex realm add|list
ctxindex source add <adapter-id> --realm <slug> [--account ...] [--no-sync] [adapter flags]
ctxindex source list|remove
ctxindex sync [--source <id>] [--mode sync|resync|diff]
ctxindex search <query> [--realm|--source|--adapter|--kind|--field k=v ...]
                        [--since|--until] [--local-only|--remote]
                        [--include-deleted] [--explain] [--json]
ctxindex aggregate --field <name> [same filters] [--top N] [--json]
ctxindex get <ref> [--json]
ctxindex thread get <ref> [--json]
ctxindex artifact list <ref> [--json]
ctxindex artifact download <artifact-ref> [--output <path>]
ctxindex export <ref> --format <fmt> [--output <path>]
ctxindex status [--source <id>] [--json]
ctxindex purge index|raw|artifacts|adhoc|source <id>
ctxindex install <path>            # later: git:..., npm:...
ctxindex extensions list
ctxindex skills list|get|path      # retained; ACF may supersede
ctxindex secrets migrate <backend>
```

Search results carry machine-readable affordances so agents never need
provider knowledge: ref, kind, snippet, and available operations derived from
adapter capabilities + profile vocabulary (`get`, `export:eml`, `download`).

Example verb collapse: the Hermes CLI's bespoke `mail senders` becomes
`ctxindex aggregate --field sender --kind communication.message --since 365d --top 50 --json`.

## 11. Spec/docs impact

- `CONTEXT.md`: rewrite product definition (access layer, not index); redefine
  Source (D6); add Ref, Resource, Profile, Artifact, Relation, Field index,
  Extension; keep Account/Grant/Realm.
- `SPEC.md`: §1 scope — remove "no dynamic third-party plugin loading" and
  "no file export" exclusions; §3 core model — resources/profiles replace
  item/chunk-only model (chunks remain as index detail); add ref grammar,
  capability flags, auth kinds incl. custom bucket, routing precedence,
  artifact store + retention, relations with natural keys, degraded
  acceptance, vocabulary versioning + purity.
- `IMPLEMENTATION.md`: drop mail_* tables + adapter migration namespaces; add
  six-table storage, extension loader, SDK/profiles packages, binary
  dynamic-import spike note.
- `V1.md`: unaffected historically; new milestone doc (`V2.md`) should carve a
  thin vertical slice: profiles for message/conversation + google.mailbox on
  new storage; get/thread/artifact/export for mail; one external extension
  (tenders) as proof.

## 12. Deferred (prove-we-need-it tier)

- Arbitrary extension CLI subcommands (D1-C / D18): if ever needed, typed command definitions registered and validated like adapters — never string templates or alias maps.
- `ctxindex describe` rendering + generated skill docs (D19; contract fields ship now).
- Out-of-process / non-TS adapters.
- npm distribution; ACF-resolver reuse decision.
- `ctx.storage` per-extension storage API.
- Multi-profile resources beyond primary+artifact (D10).
- Cross-source identity/dedup; write-back; rate-limit/quota policy (warnings
  only for now); semantic/vector search (future `embed` vocabulary slot);
  change notifications/watch.

## 13. Open questions

1. Whether realms earn their place in the redesigned model or are ceremony
   to cut before the six-table migration.
2. Field index value typing for ranges (dates/numbers) and multi-valued
   fields — encoding + query grammar for `--field`.
3. Artifact retention policy shape (per-source? per-profile? global quota?)
   and `status` disk accounting.
3b. Stored-payload migration when a profile bumps its version (re-validate
   lazily on read? re-index on upgrade? keep per-row profile version — chosen
   — and re-extract fields opportunistically?).
4. Exact `ctx://` suffix encoding rules (charset, escaping, length), and the
   error contract for refs whose source was removed (`source_gone` vs
   `not_found`).
5. Whether `aggregate` needs per-field opt-in (`aggregatable: true`) to bound
   index size, or aggregates lazily over `field_index` unconditionally.
6. Hybrid default (D7) — revisit after dogfooding partial Gmail sync.
