# ctxindex V1 design: personal context gateway

Status: accepted direction; detailed capability contracts remain in progress.
Decisions were resolved through design grills on 2026-07-13 and 2026-07-14.
This is the design for the first product version; prototype code and databases
carry no migration or compatibility obligations.

## 1. Product reframe

> **ctxindex is the local gateway through which agents discover, retrieve,
> materialize, and perform typed Actions on a person's context — mail,
> calendars, tasks, files, and arbitrary Extension-defined domains. Indexing is one
> implementation strategy for fast local discovery, not the product definition.**

Four core capabilities over the same configured Sources:

1. **Discover** — search indexed data fast; optionally search providers live;
   return stable refs, metadata, snippets.
2. **Retrieve** — fetch a complete message, thread, event, file, or task;
   download attachments and original representations; ad hoc, without requiring
   the source to be synced.
3. **Sync** — maintain searchable local projections of selected sources with
   optional artifact retention.
4. **Act** — execute typed, Profile-declared provider mutations through the
   same Source, auth, validation, and identity boundary. V1 stops at reversible
   provider-persisted email Draft create/update.

Ad hoc retrieval and sync are two access modes over one source concept, not two
products. Agent workflow policy (digest composition, triage rules, unsubscribe
safety) stays OUT of ctxindex — it lives in agent skills that call the CLI.

Division of labor with the surrounding ecosystem:

- **ctxindex**: auth, provider access, sync, search, retrieval, download/export,
  typed provider Actions, deterministic JSON output.
- **Agent skills** (e.g. the Hermes `context-hub` skill this replaces): workflow
  policy over the CLI.
- **MCP**: an optional future transport/interface to ctxindex, not the context
  model or provider runtime. V1 exposes the CLI; ten provider MCPs would remain
  ten auth/identity/search/artifact silos, while one future ctxindex MCP could
  expose the shared data plane.
- **Portable Agent Skill**: ctxindex ships one standard `skills/ctxindex/SKILL.md`
  for concise workflow orientation. The CLI embeds its exact release bytes and
  exposes them through `ctxindex docs get-skill`; loaded schemas and passive
  Extension documentation remain live discovery surfaces rather than skill
  content.

Explicitly out of scope: SaaS/remote canonical store, arbitrary provider
automation, agent workflow policy, and a universal sync protocol. Typed
Profile Actions are in scope; arbitrary Extension subcommands are not.

## 2. Decision log

| # | Decision | Choice | Notes |
|---|----------|--------|-------|
| D1 | Extension power | Adapters with open `kind`/profiles, canonical operations. No arbitrary CLI subcommands | Revisit arbitrary commands only with demonstrated need |
| D2 | Extension loading | In-process dynamic `import()` of TS/JS with full trust; Extensions use ordinary runtime imports from the private SDK workspace, while operation effects arrive through host-provided contexts | Bun executes TS natively; out-of-process protocol deferred |
| D3 | Binary distribution | Compiled Bun binary retained; external packages bundle/import the Extension SDK contract but do not import core runtime internals | Verified with Bun 1.3.13/1.3.14; 1.3.12 fails, so the project is pinned to 1.3.14. Regression test at `apps/cli/src/e2e/compiled-extension.e2e.test.ts` |
| D4 | Universal ref | `ctx://<source-id>/<adapter-opaque-suffix>` for every resource, indexed or not | Provider-native URIs kept as metadata |
| D5 | Auth ownership | Declarative `oauth2` or `none` Provider auth runs through core; API-key, basic, and custom secret-bucket forms remain deferred until a concrete Provider requires them | OAuth refresh, `needs_auth`, exit 10 stay uniform |
| D6 | Source concept | Source = configured connection; sync is optional per-source | One noun; `source add --no-sync` |
| D7 | Search default | Hybrid orchestration; adapter decides per source with sync-coverage knowledge; `--local-only` / `--remote` override | PROVISIONAL — validate by dogfooding partial Gmail sync |
| D8 | Artifacts | Managed content-addressed store; V1 has one `cached` retention class, retained until explicit purge; `--output` copies out | No automatic age, quota, or pressure eviction in V1 |
| D9 | Data shape | Minimal resource envelope + profiles; arbitrary payload allowed | |
| D10 | Profile composability | Permitted by API; V1 uses one primary Profile plus Artifact descriptors per Resource | |
| D11 | Definition style | Declarative `defineExtension`/`defineAdapter`/`defineProfile` factories; typed registries internally | pi-style authoring, lume/sessionloom-style registries |
| D12 | Unknown profile version on emit | Accept envelope-only, index degraded, warn | Matches provider-failure philosophy |
| D13 | Storage | Six generic core tables; NO per-profile tables, NO Adapter-private tables in V1 | `ctx.storage` is a future additive API |
| D14 | Relations | Bidirectional edges; targets are `ctx://` ref OR natural key (lazy resolution) | Order-independent threading, cross-source joins |
| D15 | Exports | Vocabulary slot on profiles (`format -> render`); generic core verb; no conversion pipeline | |
| D16 | Capabilities | Const array of enum flags: `["sync", "search-remote", "retrieve", "download"]`; search MODE moves to routing | |
| D17 | Distribution | Explicit local package roots and exact installed Catalog snapshots use `package.json` `ctxindex.extensions`; persistent direct local/Git/npm installation remains a dependent change | Package tooling resolves dependencies; activation reuses one manifest/collector seam |
| D18 | CLI dynamism | Generic verbs derive their whole argument space from registries (kinds, fields, formats, adapter flags from config schemas). NO parallel command/alias declarations. Typed subcommand registration through the registry machinery is the only future alternative (deferred) | Derive, never declare twice |
| D19 | Docs | An Extension root may declare one passive documentation sidecar; core validates it and exposes a transport-neutral projection separately from generated registry reference data, while CLI, web, and agent presentation consumers remain deferred | Documentation never changes definition identity or activation |
| D20 | Realms | Keep user-defined operating contexts; every Source has exactly one; no `global` Realm; explicit filters are exact | Personal/company/university are real reasoning boundaries, not security boundaries |
| D21 | Provider Actions | Profiles declare typed Actions; Adapters implement them through a Source; no arbitrary command surface | V1 ships reversible email Draft create/update only; sending deferred |
| D22 | Release baseline | This architecture is V1; prototype code/data are disposable | No schema migration, CLI compatibility, or stored-payload upgrade machinery |

## 3. Concept model

- **Realm** — user-defined operating context such as personal, company, or
  university. Every Source belongs to exactly one Realm; no filter means all
  Realms, while an explicit filter is exact. There is no special global Realm.
- **OAuth App** — exact provider-scoped application configuration identified by
  `(provider id, label)`, either public Extension metadata or secret-backed local BYOA.
- **Account** — one stable provider identity with a globally unique local label
  defaulting verbatim to the verified provider identity.
- **Grant** — one internal stable permission/token record per Account, updated
  in place on reauthorization and shareable by compatible Sources.
- **Source** — one globally labeled configured connection instance (Grant,
  Realm, config, sync on/off) using exactly one Adapter. Its verbatim default
  label is `<account-label>-<adapter-tail>`, or `<adapter-tail>` without auth.
- **Extension** — distributable module composing imported Adapters and OAuth
  Apps plus optional standalone Providers/Profiles via `defineExtension`; it has
  no operations, dependency graph, or command surface of its own.
- **Profile** — versioned, schema-backed declaration of a domain shape plus
  search fields, Relations, Artifacts, exports, and typed Actions. It is
  the only mechanism for domain semantics.
- **Action** — typed provider mutation declared by a Profile and implemented
  by an Adapter through a specific Source.
- **Draft** — reversible provider-persisted proposed state. Text composed only
  in an agent conversation is not a Draft until an Action saves it remotely.
- **Adapter** — provider-backed or providerless implementation declaring
  config/capabilities, exact imported Profiles, optional exact Provider access,
  and sync, remote search, retrieve, download, or supported Actions.
- **Resource** — one unit of context (message, event, task, file, tender) as an
  envelope plus one primary Profile payload.
- **Ref** — `ctx://<source-id>/<opaque-suffix>`; stable locator for a Resource,
  independent of local materialization. The Adapter owns the suffix.
- **Relation** — typed edge between Resources; its target is a Ref or natural
  key awaiting lazy resolution.
- **Artifact** — downloadable bytes (attachment, original record, rendered
  export) in the content-addressed store.
- **Field index** — generic typed rows extracted from Profile fields for
  filtering and aggregation.
- **Sync run** — cursor-driven attempt to refresh one Source's local
  materialization.

Dependency DAG:

```text
OAuth App ─authorizes─> Account ─owns─> private Grant
                                      ▲
                                      │ binds
Realm ─contains─> Source ─────────────┘
                         │
                         ├─ uses ────────────────> AdapterDef <──────┐
                         │                           ▲                │
Extension ─bundles───────┼────────────────────> ProfileDef           │
                         │                           │ declares       │
                         │                           ▼                │
                         │                        ActionDef ─implemented by─┘
                         ├─ sync/search/retrieve ─> Resource + Relation + Artifact
                         └─ action run ────────────> Resource (for example Draft)

ProfileDef ─extracts─> FieldIndex + FTS + Relations + Artifact descriptors
Core registries ─derive─> search/get/thread/export/action/describe CLI surface
```

## 4. Core vs vocabulary: the smart-runtime rule

**Core knows the vocabulary, never the domains.** Core never contains the word
"mail". It implements mechanics: query planning, FTS, field indexes, relation
traversal (both directions), artifact retention, sync locking, auth flows,
Action validation/routing, registries, and search routing.

Profile vocabulary slots (V1, each versioned):

```ts
defineProfile({
  id: "mail.message",
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
  actions: {
    "mail.message.draft.create": {
      effect: "reversible",
      input: z.object({ to: z.array(z.string()), subject: z.string(), bodyText: z.string() }),
      output: { profile: "mail.message" },
      docs: "Persist a provider Draft through an explicit mailbox Source",
    },
  },
})
```

Rules:

1. **Purity** — vocabulary functions are pure over the validated payload. No
   I/O. Anything needing I/O belongs in the adapter. Exception: `render` for
   multi-resource exports receives declared deps (e.g. "related resources by
   relation R"), resolved by core. Action declarations are pure schemas and
   metadata; their implementations belong to Adapters.
2. **Versioned slots** — a binary ignoring an unknown slot emits a diagnostic
   and continues (same policy as D12). Old cores tolerate new vocabulary; new
   cores give old profiles more capability.
3. **Degraded acceptance (D12)** — unknown profile id/version at emit: store
   envelope, index what the envelope carries, warn in sync run + status.
4. **No speculative migration (D22)** — V1 records version `1`, but no payload
   migration mechanism exists until a second real Profile version requires one.

Canonical Profiles bundled with the binary: `mail.message@1`, `chat.message@1`, `calendar.event@1`, and `file@1`.
External Extensions may define additional Profiles through the same public API;
V1 does not pre-select future task or conversation Profile domains or additional
export formats. Conversation behavior uses message Relations, and Artifacts are
Profile-extracted descriptors rather than an `artifact` Profile.
Forcing function: **if the mail profile cannot be expressed through the public
profile API, the API is too weak.**

## 5. Storage (D13)

V1 starts from a fresh generic schema with no per-domain tables:

| Table | Contents |
|---|---|
| `resources` | ref, source_id, realm_id, primary profile id+version, title, occurred_at, updated_at, deleted_at, origin (`synced` \| `adhoc`), payload JSON |
| `field_index` | Typed scalar rows projected from declared fields; array values occupy one ordered row per element |
| `chunks` (+FTS) | searchable text segments |
| `relations` + `relation_resolutions` | Logical Ref/natural-key edges plus zero-to-many cached Resource matches |
| `artifacts` | CAS metadata: stable Artifact Ref, owning Resource, hash, media type, size, origin Ref, fixed `cached` retention class, local path |
| `oauth_apps` | Provider-scoped local OAuth App labels, typed config refs, and timestamps |
| `sources` + sync bookkeeping | sync_runs, sync_locks, source_sync_state, tombstones, globally labeled accounts/sources, one grant per account, user-defined realms |

Prototype tables such as `items`, `mail_messages`, `mail_bodies`, and
`mail_attachments` are not part of V1. Development databases are deleted and
recreated; no migration or compatibility code is written. Adapters have no
private tables or migration namespaces. Escape valves until a future `ctx.storage` API: cursor
JSON (sync state) and the artifact store (blobs).

Field-index encoding is fixed for V1. Each row has a ctxindex ULID,
`resource_id`, field name, declared field type, zero-based ordinal, and exactly
one populated typed value column: `value_text` for `string`/`string[]`,
`value_number` for `number`/`number[]`, or `value_integer` for `boolean` (0/1)
and `datetime` (UTC epoch milliseconds). Scalars use ordinal `0`; arrays emit
one row per element and preserve order. A uniqueness constraint on
`(resource_id, field, ordinal)` and partial indexes over each typed value
support wholesale replacement, typed equality, numeric/date ranges, and
aggregation without casts. Every declared field is filterable and aggregatable;
V1 CLI `--field name=value` is equality-only, while `--since`/`--until` target
the Resource envelope's `occurred_at`. The core query model may use native
number/datetime ranges without adding another storage encoding.

Ad hoc caching: `retrieve` results are cached into the SAME tables with
`origin: adhoc`, so `download` after `get` does not re-fetch, refs never
dangle, and repeated agent queries hit disk. Remote SEARCH hits cache
envelope-only rows (ref, title, times, snippet chunk) without a validated
payload; a subsequent `get` triggers `retrieve` and fills the payload. `purge
adhoc` evicts by origin class. A later sync of the same ref upgrades the row
to `synced`. Tombstones apply only to synced rows; adhoc rows are cache
entries and are evicted, never tombstoned.

## 6. Relations and threading (D14)

Edge targets: `ctx://` ref OR a V1 string natural key `(field, value)` — e.g.
`(internetMessageId, "<abc@x>")`. Core stores each logical edge once and caches
zero-to-many matches in `relation_resolutions`; one natural key can legitimately
match copies in several Sources. Resolution is global across Sources and Realms
(Realms are not a security boundary), and runs lazily on matching Resource
arrival or traversal. Tombstoned matches remain linked but are excluded by
default; evicted matches disappear through foreign-key cascade and can resolve
again if they return. Dangling edges remain legal and queryable as unresolved.
Relations are indexed in both directions; "resources related to X by R" is a
query primitive.

`thread <ref>`: union of provider `conversation` membership and `parent`
reply-tree walk (both directions); tree when headers exist, flat fallback
otherwise. Provider conversation identifiers are Source-scoped before relation
extraction because providers do not guarantee mailbox-global identity.
Cross-source union comes from shared RFC message-id parent keys; zero-to-many
resolution keeps copies in distinct Sources as distinct Resources.

## 7. Refs (D4)

Grammar: `ctx://<source-id>/<adapter-opaque-suffix>`. Source id routes;
suffix is adapter-owned and opaque to core. Artifact refs extend the resource
ref (`.../doc/razpisna.pdf`) — still adapter-owned. Provider-native URIs
(`https://mail.google.com/...`) are envelope metadata for humans, never input.

Core uses a dedicated parser rather than a generic URL parser (which would
lowercase the authority). It validates only the routing and URI-syntax
contract: `source-id` is the
26-character uppercase Crockford-base32 Source ULID; the suffix is non-empty,
at most 16 KiB as encoded UTF-8, and consists of RFC 3986 `pchar`, `/`, and
uppercase `%HH` escapes. Adapters must percent-encode other UTF-8 bytes and
choose a stable canonical suffix. Core never decodes, normalizes, or interprets
the suffix and compares the complete Ref byte-for-byte; emitted Refs must carry
the Source id of the operation context.

Source availability is distinct from sync status. If the Source's Adapter is
not loaded, listing reports `extension_unavailable`; local envelope/index reads
continue, provider-dependent operations fail with typed
`extension_unavailable` (sync exits 50), and remote-search origins degrade to a
warning. Availability is derived from the loaded registries rather than stored
as provider data, so it recovers when the Extension returns.

## 8. Capabilities, auth, routing

### Capabilities (D16)

```ts
capabilities: ["sync", "search-remote", "retrieve", "download"] as const
```

All flags boolean. Conditional types narrow the adapter definition: declaring
`"sync"` requires the `sync` generator; omitting it forbids it. Same for
`searchRemote`, `retrieve`, `download`.

Action implementations are a separate map keyed by Profile Action id. An
Adapter may bind only Actions declared by Profiles it supports; the registry
rejects missing, extra, or schema-incompatible bindings. There is no standalone
`emit` capability: operations emit normalized Resources/Relations/Artifacts
through their capability-specific contexts.

### Auth (D5)

```ts
const provider = defineProvider({
  id,
  auth: auth.oauth2({
    authorizationUrl,
    tokenUrl,
    identity,
    pkce: { method: "S256", required: true },
    registration: { type, configSchema, environment },
    baseScopes,
    allowedHosts,
  }),
})

defineAdapter({ provider, access: { scopes: [...] }, ... })
defineAdapter({ /* providerless: no provider/access/providerApiHosts */ ... })
```

Core runs declarative flows, stores secrets, refreshes tokens, surfaces
`needs_auth` (exit 10) uniformly, and hands adapters a pre-authorized `ctx.fetch`.
`oauth-app add <provider> <label> --from-env` reads Provider-declared environment
names once and stores typed secret references plus provider-scoped labeled
metadata; runtime never consults those environment values. `account add
<provider> --app <label>` resolves that exact App and requests Provider base
scopes plus the sorted union of all loaded same-provider Adapters. Core resolves stable provider identity, upserts
one globally labeled Account per `(provider, external subject)`, records
verified Account Identities, and creates or updates that Account's one Grant in
place. Reads route typed secret references to their backend while new writes use
only the configured backend; there is no silent fallback. `custom` grants only
`ctx.secrets.get/set` (namespaced).

### Realms and Sources (D20)

Realms are exact user-defined operating contexts. Every Source must select one
existing Realm; initialization seeds no `global` Realm. An unfiltered query
spans all Realms, while `--realm company` includes only company Sources.
Realms organize reasoning and search, not authorization.

Each Account owns exactly one stable private Grant and may back multiple Sources.
Reauthorization updates that Grant in place so existing Source bindings remain
valid. Source creation resolves `--account` by exact globally unique Account
label, then Account id, restricted to the Adapter's provider; Grant ids remain
private implementation state and are not selectors;
authorization never creates an "account Source" or selects a global/latest
Grant.

### Typed Actions (D21)

Profiles declare provider-independent Action ids, input/output schemas, effect
classification, docs, and examples. Adapters bind implementations through a
specific Source and its existing auth context. V1 implements only reversible
`mail.message.draft.create` and `.update`; sending and other provider
mutations are deferred. Agent composition and approval remain workflow policy.

Gmail Draft identity uses the provider's immutable Draft id, not the embedded
Message id (which Gmail replaces on each update):
`ctx://<source-id>/draft/<draft-id>`. The normalized message payload may expose
`providerDraftId`, while update input addresses the stable Draft Resource Ref
and supplies the complete replacement recipients, subject, and body. Gmail
remote message discovery excludes the `DRAFT` label so the mutable embedded
Message id cannot create a second Resource identity for the same Draft. The
Gmail Adapter and OAuth grant require both `gmail.readonly` and `gmail.compose`;
ctxindex exposes no send binding despite the broader provider scope.

Microsoft Graph mailbox Sources bind the same two Profile Actions. Every
message/Draft request opts into `Prefer: IdType="ImmutableId"`; create uses one
`POST /me/messages`, update uses one `PATCH /me/messages/{id}`, and the stable
Ref is `ctx://<source-id>/draft/<immutable-message-id>`. The Grant requires
delegated `Mail.ReadWrite` but never `Mail.Send`; no send/reply-send/forward-send
route or Action exists and mutations are never automatically retried.

### Search routing (D7, provisional)

Precedence: CLI flag (`--local-only` / `--remote`) > per-source config >
adapter decision. Default is hybrid orchestration: each source answers per its
adapter's routing choice, which may consult sync coverage (fully mirrored →
local only; partial/none → include remote). Remote failures degrade to the
existing warning envelope; local results still return. Per-query remote
timeout degrades stragglers to warnings.

## 9. Extension SDK and loading (D2/D3/D11)

**D3 result — passed (2026-07-13, requires Bun >=1.3.13).** The original spike
proved that a relocated `bun build --compile` executable could dynamically
import external TypeScript. The retained regression now installs the private
`@ctxindex/extension-sdk` workspace into an external package, builds that
package, relocates the compiled host, and loads the package's manifest entry.
The Extension uses TypeScript syntax, runtime SDK factory imports, a relative
runtime import, and its own dependency; there is no host-provided factory API.
The check is `apps/cli/src/e2e/compiled-extension.e2e.test.ts`. Bun 1.3.12 was
killed with exit 137 at dynamic import; 1.3.13 and 1.3.14 passed. The root
toolchain pin is therefore Bun 1.3.14.

Authoring — top-level pure factories, pi-style:

```ts
import { defineAdapter, defineExtension, defineProfile } from "@ctxindex/extension-sdk";
import { mailMessageProfile } from "@ctxindex/profiles";  // canonical email Profile
```

- Factories return plain versioned definition objects; no module-level mutable
  state, no `instanceof` across package copies. Binding is by `(id, version)`.
- `@ctxindex/extension-sdk` and `@ctxindex/profiles` are private workspace
  packages for authoring and runtime contracts. Extensions import the SDK's
  factories and supported `z` directly; logger, controlled fetch, secrets,
  artifact sinks, and Resource lookup arrive through host-provided operation
  contexts so the compiled host keeps orchestration and storage internals sealed.
- Extensions may have their own `node_modules` for their own deps.
- Internals mirror lume/sessionloom patterns: const-generic registries
  (`createProfileRegistry([...] as const)`, `createAdapterRegistry`) inferring
  id unions from definition tuples, duplicate detection, runtime schema
  validation of dynamically loaded definitions, type-erased `AnyAdapter` /
  `AnyProfile` surfaces inside core.

Loading: V1 accepts explicit local package-root paths in config and exact
installed Catalog snapshots. Each materialized package declares ordered entry
modules in `package.json` `ctxindex.extensions`; package tooling resolves normal
imports. Full trust is documented. Built-in module namespaces load first, while
later conflicting packages reject atomically with a diagnostic rather than
winning by origin priority.

Removal/absence semantics: when an extension is uninstalled or fails to load,
its sources become `unavailable` (listed, not searchable remotely, no sync);
their synced resources REMAIN searchable via the envelope and field index
(payload and vocabulary still validate against the last-known profile only if
the profile came from the missing extension — in that case degrade to
envelope-level behavior, D12 policy). `source remove` / `purge source` remain
the explicit data-deletion paths; removing code never silently deletes data.

Distribution (D17): explicit local package roots and trusted Catalog snapshots
now; persistent generic local/Git/npm installation, update, and uninstall are a
dependent change that must reuse ecosystem package resolution and the same
manifest-entry/collector boundary.

## 10. CLI surface (target)

```text
ctxindex init
ctxindex oauth-app add <provider> <label> --from-env
ctxindex oauth-app list [--format json]
ctxindex oauth-app remove <provider> <label>
ctxindex account add <provider> --app <label> [--label <label>]
ctxindex account list [--format json]
ctxindex account remove <label>
ctxindex realm add|list|remove
ctxindex source add <adapter-id> --realm <slug> [--account <label|id>] [--label <label>] [--no-sync] [adapter flags]
ctxindex source list|remove
ctxindex sync [--source <label|id>] [--mode sync|resync|diff]
ctxindex search <query> [--realm|--source|--adapter|--kind|--field k=v ...]
                        [--since|--until] [--local-only|--remote]
                        [--include-deleted] [--explain] [--format json]
ctxindex aggregate --field <name> [same filters] [--top N] [--format json]
ctxindex get <ref> [--format json]
ctxindex thread <ref> [--format json]
ctxindex artifact list <ref> [--format json]
ctxindex artifact download <artifact-ref> [--output <path>]
ctxindex export <ref> --format <fmt> [--output <path>]
ctxindex action describe <action-id> [--source <label|id>] [--format json]
ctxindex action run <action-id> --source <label|id> --input <json-or-file> [--format json]
ctxindex status [--source <label|id>] [--format json]
ctxindex purge index|raw|artifacts|adhoc|source <label|id>
ctxindex extensions list
ctxindex describe [profile|adapter|action] [id] [--format json]
ctxindex docs get-skill [--output <path>] [--format text|json]
ctxindex secrets status [--format json]
ctxindex secrets backend set <keychain|file>
```

Search results and Source descriptions carry machine-readable affordances so
agents never need provider knowledge: ref, kind, snippet, and available
operations/Actions derived from Adapter capabilities + Profile vocabulary
(`get`, `export:eml`, `download`, `mail.message.draft.create`).

Example verb collapse: the Hermes CLI's bespoke `mail senders` becomes
`ctxindex aggregate --field sender --kind mail.message --since 365d --top 50 --format json`.

## 11. Documentation ownership

- `CONTEXT.md` owns the ubiquitous language and resolved relationships.
- [`openspec/specs/core-model/spec.md`](../../openspec/specs/core-model/spec.md), [`profile-vocabulary/spec.md`](../../openspec/specs/profile-vocabulary/spec.md), [`extension-loading/spec.md`](../../openspec/specs/extension-loading/spec.md), and the other capability specs under `openspec/specs/` own timeless normative behavior and the public Adapter/Extension contract.
- `docs/milestones/V1.md` owns first-release scope and vertical slices.
- Selective `openspec/specs/<capability>/implementation.md` sidecars own reference implementation doctrine; the module-architecture sidecar owns cross-cutting runtime, package, and testing choices.
- This document owns cross-cutting rationale and decisions D1–D22.
- `openspec/changes/archive/2026-07-17-v1-context-access-layer/` preserves the completed V1 change evidence; `openspec list` is authoritative for the current active-change inventory.

The documents describe V1 directly. Prototype code, tables, CLI behavior, and
local databases are not treated as a prior release and receive no migration or
compatibility path.

## 12. Deferred (prove-we-need-it tier)

- Email send and all non-email provider mutations; V1 stops at reversible email Draft create/update.
- Arbitrary Extension CLI subcommands: if ever needed, typed command definitions registered and validated like Adapters — never string templates or alias maps.
- Auto-discovery, git/npm Extension distribution, and ACF-resolver reuse.
- Out-of-process / non-TypeScript Adapters.
- `ctx.storage` per-Extension storage API.
- Multi-profile Resources beyond one primary Profile plus Artifact descriptors.
- Cross-source identity/deduplication.
- Stored-payload migration machinery until a second real Profile version exists.
- Rate-limit/quota policy beyond warning propagation; semantic/vector search; change notifications/watch.

## 13. Open questions

1. Hybrid search default (D7), to revisit after dogfooding a partial Gmail sync.
