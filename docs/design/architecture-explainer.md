---
title: "ctxindex becomes a personal context gateway: one interface for agents to discover, retrieve, materialize, and draft across every configured source."
read_minutes: 13
---

{% hero kicker="ctxindex V1" title="ctxindex becomes a personal context gateway, not just an index." meta="<b>Audience</b> Blaž · future contributors · agents · <b>Source</b> docs/design/2026-07-13-context-access-layer.md" %}
The 2026-07-13/14 design grills settled 22 decisions: one gateway, exact user-defined Realms, Profile semantics, Adapter operations, generic storage, and typed provider Actions. This page transfers the load-bearing architecture.
{% /hero %}

{% brief verdict="ctxindex is the local gateway through which agents discover, retrieve, materialize, and perform typed Actions on personal context; indexing is one strategy, and all domain semantics — including email Drafts — enter through Profiles." why="Ten independent provider tools leave auth, identity, search, refs, artifacts, and actions fragmented. Profiles normalize meaning; Adapters own provider I/O; Realms preserve personal/company/university context." next="Build V1 as tiny vertical slices: definitions, explicit-path loading, generic storage, Gmail search/get, threads, artifacts, reversible Draft Actions, then an external Extension proof." /%}

{% section claim="The product definition changed: indexing is a strategy, access is the product." %}
The original CONTEXT.md defined ctxindex as “a local-first personal context index for syncing searchable copies … into a local database.” That definition made sync mandatory, retrieval an afterthought, and every non-search operation (download this PDF, export this thread) an off-spec side channel. The redesign inverts it: ctxindex is the interface agents use to **discover** (fast local search, optional live provider search), **retrieve** (whole messages, threads, events, attachments — ad hoc, no sync required), **sync** (maintained local projections), and **act** (typed provider mutations through the same Source/auth boundary) — four capabilities over one Source concept.

The forcing use cases came from replacing a hand-built agent CLI (the Hermes context-hub skill): search mail and find threads, download whole threads as files and attachments, calendar search, sender-frequency aggregation, plus arbitrary future Extensions. Workflow policy — composition, approval conversation, digests, and triage — stays in agent skills. ctxindex validates and performs provider operations. V1 Actions stop at reversible provider-persisted email Draft create/update; sending comes later.

{% depth title="Evidence: what the old scope excluded that agents actually needed" %}
The pre-redesign monolithic specification's §1 explicitly excluded “dynamic third-party plugin loading” and “file export as a primary provider storage contract.” Both exclusions are reversed. The old Source definition — “a configured place that ctxindex syncs from” — made a never-synced Gmail account (query remotely, pull one attachment) unrepresentable. Decision D6 redefines Source as a configured connection; sync is a per-source setting.
{% /depth %}
{% /section %}

{% section claim="Core knows the vocabulary, never the domains — profiles are the only door for domain semantics." %}
Core never contains the word “mail.” It implements mechanics — query planning, FTS, field indexes, relation traversal, artifact retention, sync locking, auth flows, registries, routing — and speaks a fixed, versioned **profile vocabulary**. A Profile is a versioned schema plus declarations core can act on: search mapping (title, time, chunks), typed filterable fields, Relations, Artifact descriptors, export renderers, typed Action contracts, and docs. Everything else about a domain is opaque payload.

Canonical shapes (message, conversation, calendar event, task, file, artifact) are just bundled profiles using the same public API as any extension's profile. That is the honesty test, stated as a design rule: **if the mail profile cannot be expressed through the public profile API, the API is too weak.**

{% diagram kind="flow" hot="Profile vocabulary" caption="Accent marks the single seam through which all domain semantics reach core. Nothing else crosses it." %}
Extension: profiles + adapters
Built-ins: bundled extensions, same contract
Profile vocabulary: fields · relations · artifacts · exports · actions · docs
Core runtime: registries · planner · FTS · CAS · auth · sync
CLI verbs: search · get · thread · artifact · export · sync · action
Extension -> Profile vocabulary: defineProfile
Built-ins -> Profile vocabulary: same API
Profile vocabulary -> Core runtime: validated definitions
Core runtime -> CLI verbs: derived argument space
{% /diagram %}

Four rules keep the vocabulary honest. **Purity**: vocabulary functions are pure over the validated payload — no I/O; anything needing I/O belongs in the adapter (export renderers may receive core-resolved declared deps, e.g. “related resources by relation R” for thread-to-mbox). **Versioned slots**: a binary ignoring an unknown slot warns and continues, so old cores tolerate new vocabulary and new cores give old profiles more capability. **Degraded acceptance** (D12): an unknown Profile id/version at emit is stored envelope-only with a warning. **No speculative migration** (D22): V1 records version 1 but adds no payload migration mechanism until a second real version exists.

{% take id="vocabulary-seam" prompt="Is the fixed vocabulary rich enough, or do you already foresee a slot it's missing?" /%}
{% /section %}

{% section claim="One shared domain model and six generic storage areas replace provider-specific silos." %}
The model adds **Realm, Client, Account, Grant, Source, Extension, Profile, Action, Draft, Adapter, Resource, Ref, Relation, Artifact, Field Index, and Sync Run**. Storage uses six generic areas — Resources, field_index, chunks+FTS, Relations, Artifact metadata, and Source/Sync bookkeeping, including OAuth Client metadata. Prototype `items` and `mail_*` tables are not a prior version: V1 starts with a fresh database and no migration path.

Adapters own **no tables**. Their escape valves are the sync cursor (state) and the artifact store (blobs); a namespaced `ctx.storage` API can be added later without breaking anything — the reverse migration (removing tables extensions already use) would have been a rewrite. That asymmetry decided it.

{% depth title="Evidence: the storage table map" %}

| Table | Contents |
|---|---|
| `resources` | ref, source, realm, primary profile id+version, title, times, origin (`synced`/`adhoc`), payload JSON |
| `field_index` | (resource, field, type, value) rows from profile-declared fields |
| `chunks` + FTS | searchable text segments |
| `relations` | typed edges; target = ref OR natural key; resolved lazily |
| `artifacts` | CAS metadata: hash, media type, size, origin ref, retention class |
| Source/Sync bookkeeping | labeled OAuth Clients, Accounts, one stable Grant per Account, labeled Sources, sync_runs, sync_locks, source_sync_state, tombstones, user-defined Realms |

{% /depth %}

**Realms stay.** They encode real operating contexts — personal, company, university — while all context still belongs to the same person. Every Source selects exactly one Realm; no filter means all, an explicit filter is exact, and no magical `global` Realm exists. Realms organize reasoning, not authorization.
{% /section %}

{% section claim="Every resource is addressable by one ref grammar, indexed or not." %}
`ctx://<source-id>/<adapter-opaque-suffix>` addresses everything. The source id routes; the suffix is adapter-owned and opaque. A remote search hit that was never synced carries the same ref shape as a fully indexed row — and if that hit is later synced, the same ref resolves to the local resource. Agents pass refs back into `get`, `thread get`, `artifact download`, `export`; they never touch provider ids.

Ad hoc materialization rides the same storage: `retrieve` results are cached as `adhoc`-origin rows (remote search hits cache envelope-only; a later `get` fills the payload), so a `download` after a `get` never re-fetches, and repeated agent queries hit disk instead of provider quota. Adhoc rows are cache entries — evicted by purge policy, never tombstoned; a sync of the same ref upgrades them to `synced`.
{% /section %}

{% section claim="Relations accept natural keys, which makes mail threading order-independent and cross-source." %}
A relation edge targets either a ref or a **natural key** — a declared field/value pair such as `internetMessageId = <abc@x>`. Core stores unresolved edges and resolves them lazily: when a matching resource arrives (via the field index) or at query time. Dangling edges are legal and queryable.

This was decided for mail: `In-Reply-To`/`References` name RFC822 Message-IDs, and newest-first sync delivers children before parents constantly. Resolve-at-emit would silently drop tree edges forever; natural-key edges make threading immune to sync order and — for free — join threads spanning two mailboxes that share message-ids. `thread get` returns the union of provider conversation membership and the parent-edge tree walk (both directions), presenting a tree when headers exist and a flat date-ordered list otherwise. The same mechanism is exactly what chat threading will need later.
{% /section %}

{% section claim="Adapters declare boolean capabilities; search routing is a precedence chain, not a mode enum." %}
An adapter declares `capabilities: ["sync", "search-remote", "retrieve", "download"] as const`. Each flag is boolean, and conditional types enforce the pairing: declaring `sync` requires the sync generator; omitting it forbids it. The old `searchMode: "indexed" | "federated" | "hybrid"` was never a capability — it was a routing preference — so it moved out.

Routing precedence: **CLI flag** (`--local-only` / `--remote`) beats **per-source config** beats **adapter decision**. Default is hybrid orchestration: each source answers per its adapter's routing choice, which should consult sync coverage — a fully mirrored mailbox answers locally; a partial 90-day window includes the provider. Remote failures degrade to per-origin warnings; local results always return. This default is explicitly provisional (D7) pending dogfooding with a partially-synced Gmail.

Auth is layered the same way (D5): declarative specs (`oauth2` with adapter-supplied endpoints, `api-key`, `basic`, `none`) that core executes uniformly — token refresh, `needs_auth`, exit code 10 — plus a deliberately minimal `ctx.secrets.get/set` escape hatch for weird schemes like cookie-jar portals. OAuth application credentials enter once through `client add --from-env` and persist as a provider-scoped labeled Client. `account add` authorizes one provider identity with that Client, requests all loaded same-provider Adapter scopes, and creates or updates the Account's one stable internal Grant in place. Globally labeled Sources bind that Grant, so reauthorization preserves their credential link.
{% /section %}

{% section claim="Typed Actions are provider operations without arbitrary Extension command packs." %}
A Profile declares an Action's stable id, input/output schemas, effect class, docs, and examples; an Adapter binds its provider implementation. The Extension only bundles those definitions. Core validates input before provider I/O and exposes availability through registry-derived affordances.

V1 deliberately proves only reversible email writes: `communication.message.draft.create` and `.update`. An agent can compose text without ctxindex; the Action is needed only when it persists that text into a selected mailbox Source. The result is a normal `communication.message` Resource with a stable Ref. Sending, calendar writes, and task mutations remain deferred.

This boundary avoids a second Gmail tool with duplicate auth while keeping judgment in the agent: the skill composes and asks; ctxindex selects the exact Source, validates, writes, and reports provider state.
{% /section %}

{% section claim="Extensions load in-process with full trust, and the binary stays sealed because nothing imports runtime code." %}
V1 Extensions are trusted TS/JS modules loaded from explicit config paths and dynamically imported — Bun executes TypeScript natively, no build step. Auto-discovery and git/npm distribution come later. The compiled-binary constraint shaped the contract: an extension cannot import the binary's live modules, so extensions import **types only** (`@ctxindex/extension-sdk`, `@ctxindex/profiles` — descriptors and schemas for authoring DX) and receive every runtime value (schema library, logger, pre-authorized fetch, secrets, artifact sink) through host-provided context objects. Binding between an SDK descriptor and the binary's behavior is by `(id, version)`, never object identity.

```ts {% file="~/.config/ctxindex/extensions/fastmail/index.ts" hl="9" %}
import { defineAdapter, defineExtension } from "@ctxindex/extension-sdk";
import { communication } from "@ctxindex/profiles";

export default defineExtension({
  id: "fastmail",
  version: "0.1.0",
  adapters: [defineAdapter({
    id: "fastmail.mailbox",
    emits: [communication.message, communication.conversation],
    capabilities: ["sync", "retrieve", "download"],
    auth: { kind: "api-key", label: "Fastmail API token" },
    async *sync(ctx) { /* jmap → ctx.upsert(communication.message.value(...)) */ },
    async retrieve(ctx, ref) { /* ... */ },
    async download(ctx, aref, sink) { /* ... */ },
  })],
});
```

The highlighted line is the payoff: `emits` narrows what `upsert` accepts, so a third-party mail adapter gets full autocomplete against the canonical message schema — and instantly inherits `--kind mail` search, `--field unread=true`, `thread get`, and `export --format eml`, because the **profile** carries that behavior, not the adapter.

Removal semantics are data-safe: uninstalling an extension makes its sources unavailable, but synced resources remain searchable (degrading to envelope level where vocabulary is gone). Removing code never silently deletes data.

{% take id="trust-model" prompt="Full-trust in-process extensions — acceptable posture, or do you want the out-of-process tier sooner?" /%}
{% /section %}

{% section claim="The CLI derives its argument space from the registries — nothing is declared twice." %}
A string-template alias system (“`tenders search` expands to `search --kind enarocanje.tender`”) was proposed and rejected: it restates facts the registries already know, in an unvalidated, unsyncable form. The rule that replaced it (D18): **derive, never declare twice.** Valid `--kind` values come from profile ids and their declared aliases; valid `--field` names, types, and value parsing come from field declarations; Adapter flags on `source add` are generated from config schemas; `--format` options are Profile export-map keys; and `action describe|run` derives ids and input schemas from Profile Actions plus Adapter bindings. Unknown field on a kind → structured error listing valid fields. If real subcommand ergonomics are ever needed, the only acceptable form is typed command definitions registered and validated like adapters — parked behind demonstrated need.

Documentation follows the same rule (D19): definitions are born self-documenting (`docs` fields, kind aliases, schema `.describe()`), and a future `ctxindex describe` renders agent-facing docs from the registries. Hand-written prose is limited to workflow guidance. The Hermes CLI's bespoke `mail senders` command collapses into a generic derived verb: `ctxindex aggregate --field sender --kind mail --since 365d --top 50 --json`.
{% /section %}

{% section claim="Twenty-two decisions define V1; later power remains behind demonstrated need." %}
The design doc carries the full D1–D22 log with rationale and reversibility. The structural ones:

{% decision %}
{% option name="D1 · Extension power: adapters with open kinds" fate="Chosen" reason="Uniform operations are the product; arbitrary extension subcommands would fragment the agent-facing surface. Typed subcommand registration remains the only future alternative." chosen=true /%}
{% option name="D2/D3 · In-process loading, sealed binary" fate="Chosen · verified" reason="Bun 1.3.14 compiled binaries dynamically loaded external TypeScript, relative TypeScript imports, and extension-owned dependencies after relocation; factory-receives-API keeps the binary sealed." chosen=true /%}
{% option name="D13 · No custom tables anywhere" fate="Chosen" reason="Six generic tables cover every walked use case; restoring per-extension storage later is additive, removing it later would be a rewrite." chosen=true /%}
{% option name="Out-of-process adapters, npm distribution, ctx.storage, multi-profile resources" fate="Deferred" reason="Each is additive later; none has a demonstrated user today." /%}
{% option name="D20 · Exact user-defined Realms" fate="Chosen" reason="Personal, company, and university are real reasoning scopes; no-filter already means all, so no implicit global Realm is needed." chosen=true /%}
{% option name="D21 · Typed provider Actions" fate="Chosen · narrow V1" reason="Actions reuse Source/auth/identity and stay registry-derived; V1 proves only reversible provider email Drafts." chosen=true /%}
{% option name="D22 · First-version baseline" fate="Chosen" reason="Prototype code and databases are disposable, so migration and compatibility work would preserve the wrong model." chosen=true /%}
{% /decision %}

Remaining questions are owned by later slices: field-index encoding and query grammar, Artifact retention/quota policy, exact Ref suffix/error rules, and D7 hybrid-search dogfooding. Realms, V1 framing, migration policy, and Draft Actions are resolved. The D3 loading gate passed; repeatable evidence lives at `scripts/spikes/d3-compiled-extension/`.
{% /section %}

{% section claim="V1 is implemented as tiny vertical slices, not one architecture rewrite." %}
CONTEXT.md owns the sharpened language; [`openspec/specs/core-model/spec.md`](../../openspec/specs/core-model/spec.md), [`provider-actions/spec.md`](../../openspec/specs/provider-actions/spec.md), and the other capability specs under `openspec/specs/` own normative access and Action contracts; docs/milestones/V1.md owns first-release scope and slice order; selective `openspec/specs/<capability>/implementation.md` sidecars describe intended technical shape; and OpenSpec changes carry testable capability deltas and tasks. There is no predecessor version to migrate or preserve.

{% timeline %}
{% step when="Done — D3 spike" %}Bun 1.3.14 compiled binary loaded an external `.ts` factory, relative `.ts` helper, and extension-owned dependency after relocation.{% /step %}
{% step when="Done — domain boundary" %}Kept exact user-defined Realms; added typed Profile Actions with reversible email Drafts as the only V1 mutation.{% /step %}
{% step when="Now — specify first slice" now=true %}Write the Profile-definition/registry capability spec and tasks, then implement only that behavior.{% /step %}
{% step when="Next — walk vertically" %}Explicit loader → generic storage → Gmail search/get → threads → Artifacts/export → Draft Actions.{% /step %}
{% step when="Proof — external seam" %}Load the tenders Extension outside the binary, generate docs, verify V1, then replace the Hermes CLI.{% /step %}
{% /timeline %}
{% /section %}
