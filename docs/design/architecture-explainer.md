---
title: "ctxindex becomes a personal context access layer: one interface for agents to search, fetch, and materialize your mail, calendar, tasks, files — and anything an extension adds."
read_minutes: 12
---

{% hero kicker="ctxindex redesign" title="ctxindex becomes a personal context access layer, not just an index." meta="<b>Audience</b> Blaž · future contributors · agents · <b>Source</b> docs/design/2026-07-13-context-access-layer.md" %}
The 2026-07-13 design session reframed the product, settled 19 decisions, and reduced the model to ten nouns over six generic tables. This page transfers the whole architecture: what changed, why, and where the load-bearing rules live.
{% /hero %}

{% brief verdict="ctxindex is now the source-of-truth interface through which agents discover, retrieve, and locally materialize personal context; indexing is one implementation strategy, and ALL domain knowledge — including mail — enters through one extension mechanism: profiles." why="The old framing (sync-first local index) could not serve the real agent workflows: ad hoc thread fetches, attachment downloads, non-synced sources, arbitrary connector domains like tenders. Making core domain-ignorant and profile-driven makes every capability additive." next="Run the Bun compiled-binary dynamic-import spike (D3), take a hard look at whether realms survive, then carve the V2 vertical slice: mail profiles + google.mailbox on the new storage + a tenders extension as external proof." /%}

{% section claim="The product definition changed: indexing is a strategy, access is the product." %}
The original CONTEXT.md defined ctxindex as “a local-first personal context index for syncing searchable copies … into a local database.” That definition made sync mandatory, retrieval an afterthought, and every non-search operation (download this PDF, export this thread) an off-spec side channel. The redesign inverts it: ctxindex is the interface agents use to **discover** (fast local search, optional live provider search), **retrieve** (whole messages, threads, events, attachments — ad hoc, no sync required), and **sync** (maintained local projections) — three capabilities over one source concept.

The forcing use cases came from replacing a hand-built agent CLI (the Hermes context-hub skill): search mail and find threads, download whole threads as files and attachments, calendar search, sender-frequency aggregation, plus arbitrary future connectors. Workflow policy — digests, triage rules, unsubscribe safety — stays out of ctxindex, in agent skills that call the CLI.

{% depth title="Evidence: what the old scope excluded that agents actually needed" %}
The pre-redesign SPEC §1 explicitly excluded “dynamic third-party plugin loading” and “file export as a primary provider storage contract.” Both exclusions are reversed. The old Source definition — “a configured place that ctxindex syncs from” — made a never-synced Gmail account (query remotely, pull one attachment) unrepresentable. Decision D6 redefines Source as a configured connection; sync is a per-source setting.
{% /depth %}
{% /section %}

{% section claim="Core knows the vocabulary, never the domains — profiles are the only door for domain semantics." %}
Core never contains the word “mail.” It implements mechanics — query planning, FTS, field indexes, relation traversal, artifact retention, sync locking, auth flows, registries, routing — and speaks a fixed, versioned **profile vocabulary**. A profile is a versioned schema plus declarations core can act on: search mapping (title, time, chunks), typed filterable fields, relations, artifact descriptors, export renderers, docs. Everything else about a domain is opaque payload.

Canonical shapes (message, conversation, calendar event, task, file, artifact) are just bundled profiles using the same public API as any extension's profile. That is the honesty test, stated as a design rule: **if the mail profile cannot be expressed through the public profile API, the API is too weak.**

{% diagram kind="flow" hot="Profile vocabulary" caption="Accent marks the single seam through which all domain semantics reach core. Nothing else crosses it." %}
Extension: profiles + adapters
Built-ins: bundled extensions, same contract
Profile vocabulary: fields · relations · artifacts · exports · docs
Core runtime: registries · planner · FTS · CAS · auth · sync
CLI verbs: search · get · thread · artifact · export · sync
Extension -> Profile vocabulary: defineProfile
Built-ins -> Profile vocabulary: same API
Profile vocabulary -> Core runtime: validated definitions
Core runtime -> CLI verbs: derived argument space
{% /diagram %}

Three rules keep the vocabulary honest. **Purity**: vocabulary functions are pure over the validated payload — no I/O; anything needing I/O belongs in the adapter (export renderers may receive core-resolved declared deps, e.g. “related resources by relation R” for thread-to-mbox). **Versioned slots**: a binary ignoring an unknown slot warns and continues, so old cores tolerate new vocabulary and new cores give old profiles more capability. **Degraded acceptance** (D12): an unknown profile id/version at emit is stored envelope-only with a warning — sync never fails because one connector evolved.

{% take id="vocabulary-seam" prompt="Is the fixed vocabulary rich enough, or do you already foresee a slot it's missing?" /%}
{% /section %}

{% section claim="Ten nouns over six generic tables replace per-domain schemas entirely." %}
The concept model is: **ref, resource, profile, adapter, extension, source, sync run, artifact, relation, field index**. Storage collapses to six generic structures — resources (envelope + validated payload JSON), field_index (typed rows from declared fields), chunks+FTS, relations, artifact metadata, and the existing sync bookkeeping. The dedicated `mail_messages` / `mail_bodies` / `mail_attachments` tables and the entire per-adapter migration-namespace subsystem are deleted from the design.

Adapters own **no tables**. Their escape valves are the sync cursor (state) and the artifact store (blobs); a namespaced `ctx.storage` API can be added later without breaking anything — the reverse migration (removing tables extensions already use) would have been a rewrite. That asymmetry decided it.

{% depth title="Evidence: the storage table map" %}

| Table | Contents |
|---|---|
| `resources` | ref, source, realm, primary profile id+version, title, times, origin (`synced`/`adhoc`), payload JSON |
| `field_index` | (resource, field, type, value) rows from profile-declared fields |
| `chunks` + FTS | searchable text segments |
| `relations` | typed edges; target = ref OR natural key; resolved lazily |
| `artifacts` | CAS metadata: hash, media type, size, origin ref, retention class |
| sync bookkeeping | sources, sync_runs, sync_locks, source_sync_state, tombstones, accounts, grants, realms (unchanged) |

{% /depth %}

One noun is on notice: **realms** were carried over from v1 without re-examination. For a single user with few sources they may be pure ceremony — flagged for a hard look before V2.
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

Auth is layered the same way (D5): declarative specs (`oauth2` with adapter-supplied endpoints, `api-key`, `basic`, `none`) that core executes uniformly — token refresh, `needs_auth`, exit code 10 — plus a deliberately minimal `ctx.secrets.get/set` escape hatch for weird schemes like cookie-jar portals.
{% /section %}

{% section claim="Extensions load in-process with full trust, and the binary stays sealed because nothing imports runtime code." %}
Extensions are TS/JS modules under `~/.config/ctxindex/extensions/` (plus config paths), dynamically imported — Bun executes TypeScript natively, no build step. The compiled-binary constraint shaped the contract: an extension cannot import the binary's live modules, so extensions import **types only** (`@ctxindex/extension-sdk`, `@ctxindex/profiles` — descriptors and schemas for authoring DX) and receive every runtime value (schema library, logger, pre-authorized fetch, secrets, artifact sink) through host-provided context objects. Binding between an SDK descriptor and the binary's behavior is by `(id, version)`, never object identity.

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
A string-template alias system (“`tenders search` expands to `search --kind enarocanje.tender`”) was proposed and rejected: it restates facts the registries already know, in an unvalidated, unsyncable form. The rule that replaced it (D18): **derive, never declare twice.** Valid `--kind` values come from profile ids and their declared aliases; valid `--field` names, types, and value parsing come from field declarations; adapter flags on `source add` are generated from config schemas; `--format` options are the profile's export-map keys. Unknown field on a kind → structured error listing valid fields. If real subcommand ergonomics are ever needed, the only acceptable form is typed command definitions registered and validated like adapters — parked behind demonstrated need.

Documentation follows the same rule (D19): definitions are born self-documenting (`docs` fields, kind aliases, schema `.describe()`), and a future `ctxindex describe` renders agent-facing docs from the registries. Hand-written prose is limited to workflow guidance. The Hermes CLI's bespoke `mail senders` command collapses into a generic derived verb: `ctxindex aggregate --field sender --kind mail --since 365d --top 50 --json`.
{% /section %}

{% section claim="Nineteen decisions are logged; five things were deliberately deferred behind demonstrated need." %}
The design doc carries the full D1–D19 log with rationale and reversibility. The structural ones:

{% decision %}
{% option name="D1 · Extension power: adapters with open kinds" fate="Chosen" reason="Uniform operations are the product; arbitrary extension subcommands would fragment the agent-facing surface. Typed subcommand registration remains the only future alternative." chosen=true /%}
{% option name="D2/D3 · In-process loading, sealed binary" fate="Chosen" reason="Bun runs TS natively; factory-receives-API keeps the binary sealed. Spike pending on compiled-binary dynamic import." chosen=true /%}
{% option name="D13 · No custom tables anywhere" fate="Chosen" reason="Six generic tables cover every walked use case; restoring per-extension storage later is additive, removing it later would be a rewrite." chosen=true /%}
{% option name="Out-of-process adapters, npm distribution, ctx.storage, multi-profile resources" fate="Deferred" reason="Each is additive later; none has a demonstrated user today." /%}
{% option name="Write-back to providers" fate="Rejected" reason="Different authorization and safety problem; read-oriented product stays coherent." /%}
{% /decision %}

Open questions before V2: the D3 loading spike (can invalidate the extension mechanism — run it first), field-index encoding for ranges and multi-valued fields, artifact retention policy shape, stored-payload migration on profile version bumps, the dangling-ref error contract, and whether realms survive.
{% /section %}

{% section claim="Documentation is already propagated; V2 should be a thin vertical slice." %}
CONTEXT.md is rewritten in the new language (Resource supersedes Item; Ref, Profile, Extension, Artifact, Relation, Field Index added; Source redefined). SPEC.md §1 scope is reversed on plugins and export, §3 is rebuilt around profiles/refs/capabilities/storage/loading, §4 specifies natural-key relations, §8 drops adapter-owned tables, §10e becomes routing precedence, and a new §10f covers retrieval, artifacts, and export. IMPLEMENTATION.md carries a supersession banner mapping each stale section to its replacement rather than a premature rewrite — the V2 milestone should carve the implementation slice: message/conversation profiles + google.mailbox on the new storage, mail get/thread/artifact/export end to end, and one external extension (tenders) as proof that the seam holds.

{% timeline %}
{% step when="Now — spike" now=true %}Verify `bun build --compile` binaries can dynamically import external `.ts` extensions with the factory contract.{% /step %}
{% step when="Next — decide realms" %}Keep or cut before any V2 schema work.{% /step %}
{% step when="Then — V2 slice" %}Mail profiles + google.mailbox on six-table storage; thread/artifact/export verbs; tenders extension externally.{% /step %}
{% step when="Later — replace Hermes CLI" %}Port the context-hub skill to plain ctxindex invocations; delete the bundled Bun project.{% /step %}
{% /timeline %}
{% /section %}
