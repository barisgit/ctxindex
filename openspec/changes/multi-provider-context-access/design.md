## Context

V1 proved the generic Profile/Adapter/Resource/Action model with one Google mailbox, local files, and reversible Gmail Drafts. The data model already permits many Accounts, Grants, Sources, and Realms, but the implementation does not yet realize that model safely: authorization is hard-coded to Google, derives the union of all loaded Google scopes, creates a new Account on every login, and identifies the provider from token-host heuristics. Secret storage is active infrastructure rather than legacy code, yet the CLI exposes only migration, accepts passphrases in argv, contains unused status/config paths, and `openDeps` silently writes to the file backend when configured Keychain access fails.

Calendar and Microsoft support cross the SDK auth contract, core security/storage, CLI, Profiles, provider Adapters, provider mocks, and Human consent. V1 remains a completed milestone; this change defines the next V1.1 increment. Prototype databases and CLI aliases remain disposable, but stable exit meanings, generic storage/search/retrieval, Profile Action ids, external Extension loading, and the no-send boundary remain contracts.

Official stable provider constraints shape the design. Google Calendar exposes full/incremental event collection sync with a final `nextSyncToken`, includes deletions during incremental sync, and requires a full reconciliation after HTTP 410 token invalidation. Microsoft Graph v1.0 exposes stable calendar-view delta only for a fixed start/end range; whole-calendar event delta is beta. Graph Outlook item ids change on moves unless every relevant request opts into `Prefer: IdType="ImmutableId"`. Microsoft authorization code flow recommends PKCE and the `common` tenant for an application registered for both personal and organizational Accounts.

## Goals / Non-Goals

**Goals:**

- Make configured secret backend use explicit, observable, non-silent, and crash-safe.
- Execute Google and Microsoft OAuth from loaded declarative Adapter definitions, exact selected scopes, and stable provider identity.
- Deduplicate Accounts while retaining explicit Grants and Source-to-Grant binding.
- Give agents one safe Account-to-Grant-to-Source inventory.
- Add one strict calendar Profile and read-only indexed Google/Microsoft calendar Sources.
- Add federated Microsoft mailbox reads, attachments, conversations, exports, and the existing Draft create/update Actions.
- Prove no send permission, Action, endpoint, or automatic mutation retry.
- Keep provider implementation local to owned Adapter modules and all domain semantics in Profiles.

**Non-Goals:**

- Sending mail, calendar writes/RSVPs, or any new irreversible Action.
- Exchange Server/on-premises protocols, application permissions, daemon/service-account auth, or tenant-wide admin access.
- Cross-source identity collapse, contact/task/Drive/OneDrive support, calendar discovery UI, or arbitrary provider commands.
- Microsoft beta whole-calendar delta, webhook subscriptions, push notifications, or semantic/vector search.
- Compatibility migrations for prototype databases, old auth flags, `auth list`, or `secrets migrate`.

## Decisions

### D1. One OpenSpec change and one V1.1 milestone, delivered through gated vertical slices

Secrets, OAuth declarations, Account identity, and the new Adapters are one dependency graph: independently specifying the providers while changing those foundations in another active change would duplicate and race the shared contracts. One change owns the coherent target, while `tasks.md` imposes independently verifiable slices and commits: secrets; auth/accounts; account CLI; calendar Profile; Google Calendar; Google checkpoint; Microsoft auth/mail; Outlook Drafts; Microsoft Calendar; cross-provider gates; Microsoft checkpoint/final verification.

`V1.md` remains the historical first milestone. A new `V1_1.md` owns the new must-ship/deferred list and exit criteria. Timeless behavior is synchronized into `SPEC.md`; implementation choices update `IMPLEMENTATION.md` and accepted design D5/D20/D21.

Alternative rejected: three independent changes for foundations, Google Calendar, and Microsoft. That looks smaller but requires temporary duplicate OAuth interfaces and makes exact scope/account acceptance impossible to verify end to end until all three are active.

### D2. A routing Secret Vault separates reference resolution from the configured write backend

Core introduces one deep Secret Vault interface. `get` and `delete` route from the typed URI (`keychain:` or `file:`); `set` writes only to the backend persisted in config. There is no runtime fallback. `init` probes Keychain once for fresh state, persists Keychain when usable, otherwise creates private file key material and persists file. Existing explicit configuration is never reinterpreted.

`secrets status [--json]` uses a minimal backend manager that can report configured backend, availability, and aggregate reference counts without opening values or loading Extensions. `secrets backend set <keychain|file>`:

1. validates/decrypts the source and probes or explicitly prepares the target;
2. copies every indexed secret to deterministic target keys while retaining source entries;
3. updates known durable references in one SQLite transaction;
4. atomically writes configuration selecting the target;
5. deletes old copies best-effort and reports bounded cleanup warnings.

Because Vault reads route by each reference, a crash between steps 3 and 4 leaves mixed references usable. Target copy is deterministic and retries are idempotent. No source value is deleted before all references/configuration can use the target. File envelopes explicitly record whether PBKDF passphrase or a 32-byte private key file derived the encryption key; reads choose from envelope metadata rather than whichever environment happens to be present. `CTXINDEX_SECRETS_PASSPHRASE` remains the only passphrase input; absent that variable, selecting a new file backend creates mode-0600 key material. `secrets.passphrase_env`, argv `--passphrase`, silent fallback, unused `paths`, and dead status plumbing are removed or made real.

Alternative rejected: automatically falling back to file when Keychain fails. It can write file refs while config still selects Keychain, then strand those credentials when Keychain later returns.

### D3. Stable Account identity is unique; Grants remain explicit permission sets

Fresh schema makes authenticated `accounts.external_user_id` non-null and adds a unique `(provider, external_user_id)` constraint. Authorization must obtain this subject from the declared provider identity endpoint; labels/emails are mutable display data and never substitute for missing identity. Verified email/principal values populate the existing `account_identities` table by declared kind, making that previously unused domain relation real without using an address as the Account key. Authorization upserts the Account and its identities, then creates a Grant containing the normalized scopes and typed secret references. Reauthorization of the same subject reuses the Account; separate scope sets may remain separate Grants. Existing Sources are never silently rebound.

Source creation continues to select a concrete Grant id. Compatibility is provider equality plus required Adapter scopes being a subset of normalized granted scopes. Multiple Sources can share one compatible Grant. If several Grants are compatible, selection remains explicit rather than newest-wins.

Alternative rejected: one mutable Grant per Account. Narrow and broad permission sets can intentionally coexist; replacing one would unexpectedly change or invalidate existing Sources.

### D4. OAuth is one declarative core flow selected by Adapter ids

The SDK OAuth auth declaration gains a stable provider id and provider metadata sufficient for a uniform host flow: authorization/token/identity URLs; identity subject, ordered label, and typed Account Identity JSON paths; PKCE/client-auth mode; provider identity/refresh scopes; approved API hosts; safe default environment variable names; and fixed authorization parameters. Adapter definitions retain only their operation scopes alongside the shared provider descriptor. Registry validation rejects malformed URLs, inconsistent definitions for one provider, and duplicate/empty scopes.

`auth add <provider> --adapter <id>... (--loopback|--from-env) [--client-id <public-id>] [--label <label>]` requires at least one selected loaded Adapter, all from the requested provider. Core requests the strict sorted union of only those Adapter scopes and provider base scopes. `--loopback` is explicit; there is no TTY-triggered browser launch or deprecated out-of-band code input. State, callback path, timeout, and PKCE verifier/challenge are validated. Long-lived values and client secrets come only from central environment names or typed secret input, never literal argv. `--from-env` is the explicit headless/checkpoint path and validates the token response's granted scopes before identity/storage.

Token exchange, identity fetch, token refresh/rotation, Account/Grant persistence, and cleanup move from Google-specific CLI helpers into core. Refresh is generic; a read may perform the existing one 401 refresh retry, but Action contexts keep retry disabled. Provider and per-Adapter hosts are checked before the global egress chokepoint.

Alternative rejected: a Google flow plus a separate Microsoft flow. It would preserve the exact duplication and provider branching the public declarative auth contract is intended to remove.

### D5. Account inventory replaces Google-only auth inventory

`auth` becomes authorization behavior (`auth add`) rather than a second data inventory. The Google-only `auth list` is removed. `account list [--json]` queries one Account module and returns deterministic nested Accounts, Grants, and bound Sources/Realms. Human output is compact; JSON is lossless for safe metadata. It includes local ids, provider, label, normalized scopes, expiry state, Source id/name/Adapter/Realm, but no secret values/references and no stable external subject by default when a label is available. `source list` remains the complete selected Source inventory, including unauthenticated local directories.

### D6. `calendar.event@1` models timing explicitly and leaves provider transport outside the Profile

The new strict payload uses a discriminated timing value:

- timed: ordered RFC 3339 instants plus optional original provider time-zone labels;
- all-day: ISO start date and exclusive ISO end date.

It includes provider calendar/event ids, title, description text, location, normalized status, organizer, attendees, recurrence series identity/original start, provider URL, and created/updated timestamps. Profile-owned pure functions provide bounded search chunks, title/summary/occurred time, typed fields, alias `events`, and an optional same-Source series Relation. There are no calendar Actions and initially no special export beyond deterministic JSON.

Refs are `ctx://<UPPERCASE-SOURCE-ULID>/event/<encodeURIComponent(opaque-stable-id)>`. Provider ids remain case-sensitive inside the path. Two Sources selecting overlapping provider context intentionally produce distinct Refs.

### D7. One calendar Source selects one calendar and one rolling indexed window

Both calendar Adapters use registry-derived `calendar_id`, `past_days` (default 365), and `future_days` (default 730). Omitted calendar id means only the provider's documented default/primary calendar. This preserves the domain rule that one Source represents one configured collection and lets many calendar Sources share one Grant. Google supports provider incremental tokens for any selected calendar. Stable Graph v1.0 supports delta-token synchronization only for the default calendar; a named Microsoft calendar therefore uses a complete paged `calendarView` scan plus manifest reconciliation for the same fixed window and never calls the beta per-calendar delta route.

Each cursor stores version, config fingerprint, anchored UTC start/end, provider sync/delta token, and a code-point-sorted manifest of stable event ids. The window remains fixed during incremental rounds. `resync`, invalid cursor/token, config change, or a monthly horizon refresh performs a full scan in a newly anchored window and compares only after complete success; missing prior ids then emit removals. Partial/uncertain scans retain prior cursor/manifest and do not infer deletion. The manifest is the bounded cost of correct reconciliation because core does not own Adapter-specific absence semantics.

Alternative rejected: Microsoft beta whole-calendar delta. Stable v1.0 only supports calendar-view delta over fixed bounds, so the limitation is explicit and shared rather than hidden in one provider.

### D8. Google Calendar uses stable events-list synchronization

`google.calendar@1` is indexed with `sync` and `retrieve`, uses the narrow `calendar.events.readonly` operation scope, and accesses one configured calendar. Initial full scans use the anchored range, expanded recurring instances, deleted visibility, complete paging, and final `nextSyncToken`. Incremental pages use the prior token and provider-compatible shaping; deleted/cancelled entries emit removals. HTTP 410 triggers one bounded full reconciliation, not recursive retry. Emissions and cursor manifest are sorted after complete response collection for deterministic behavior. Retrieval uses the calendar-scoped event endpoint and validates exact canonical Source authority before auth.

Google provider base scopes add stable OpenID identity/email and offline access behavior. Selecting only Calendar never requests Gmail scopes; selecting mailbox plus Calendar produces one compatible Grant.

### D9. Microsoft Graph shares one provider module and two owned Adapters

A provider-owned `packages/adapters/src/microsoft/` module holds Graph URL/header/response/normalization helpers plus `mailbox/` and `calendar/` Adapter owners. It does not introduce a Microsoft SDK dependency; all I/O remains REST through `context.fetch`. `login.microsoftonline.com/common` supports app registrations configured for personal and organizational Accounts. Provider identity comes from declared Graph `/me` fields using stable user id, with `User.Read`, OIDC, and `offline_access` base scopes.

`microsoft.mailbox@1` is federated with `search-remote`, `retrieve`, and `download`, requires `Mail.ReadWrite` because its supported Profile includes Draft Actions, and always sends `Prefer: IdType="ImmutableId"`. Remote search translates supported communication filters into documented message `$search`/KQL, bounds paging, excludes `isDraft` results, and normalizes messages into `communication.message@1`. Retrieval requests text body and required internet-message/conversation fields, lists attachment metadata without intentionally downloading file bytes, and emits managed Artifact descriptors. File bytes use the attachment `$value` route; unsupported item/reference attachments warn safely. Conversation id and RFC headers drive existing Profile Relations and generic thread traversal.

`microsoft.calendar@1` is indexed with `sync` and `retrieve` and requires `Calendars.Read`. The default calendar uses stable v1.0 `/me/calendarView/delta`; an explicitly named calendar uses stable v1.0 `/me/calendars/{id}/calendarView` as a full paged window scan with manifest reconciliation because the equivalent per-calendar delta route is beta-only. Opaque next/delta links are accepted only for their matching strategy and are validated as HTTPS Graph URLs in the selected route family. Both paths opt into immutable event ids and UTC response timing; default-calendar `@removed` entries and successful complete manifest reconciliation supply tombstones. Original provider time-zone labels remain payload metadata.

### D10. Outlook Drafts reuse the exact communication Actions and immutable message identity

Microsoft binds only `communication.message.draft.create` and `.update`. Create performs one `POST /me/messages` with immutable-id preference and returns `ctx://<SOURCE>/draft/<immutable-message-id>`. Update validates raw canonical same-Source Draft Ref and complete replacement input before one `PATCH /me/messages/{id}` that explicitly replaces/clears all recipient arrays, subject, and text body. The expected 201/200 response supplies the complete normalized Resource; no follow-up mutation or automatic retry occurs. Microsoft consent never includes `Mail.Send`, registry exposes no send Action, search excludes Draft messages, and transport helpers have no send route.

Immutable ids survive moves within a mailbox but not archive-mailbox transfer/export-reimport; those provider operations legitimately create a new identity. IDs are treated case-sensitively.

### D11. Core stays provider-neutral and package ownership stays local

Core owns Secret Vault/backend manager, Account/Auth modules, declarative OAuth orchestration, generic provider context, schema, registry validation, and CLI-facing results. It contains no Google/Microsoft response schemas or resource normalization. Profiles own calendar semantics. Google Calendar code lives in `packages/adapters/src/google-calendar/`; Microsoft code lives under its provider directory; `builtins.ts` only composes definitions. CLI commands remain thin and contain no SQL/provider HTTP/id generation. Architecture/dependency tests discover these invariants rather than enumerating every implementation file.

No new runtime provider SDK is added. PKCE/state use platform crypto; REST schemas use existing Zod; HTML mail normalization reuses existing Profile/Adapter facilities where appropriate.

### D12. Verification is mocked first and live only at explicit checkpoints

Provider mocks record redacted method/path/headers/body and implement stateful OAuth/token/identity, paging, sync/delta, message/event retrieval, attachment bytes, and Draft create/update. Each slice has focused public-interface tests plus a real compiled CLI sandbox. Security tests prove malformed schema/Ref/config causes zero auth/network/storage, exact scopes exclude unselected providers/capabilities, host allowlists reject cross-provider URLs, logs redact canaries, read retry is bounded, mutations are one-shot, and no route contains send.

After mocked Google gates, the agent prepares isolated state and pauses for explicit Google login/consent, then performs the exact approved harmless mailbox and calendar search/get reads only. After all Microsoft mocked gates, it pauses for app-registration/login/consent and exact approved mailbox/calendar reads plus one self-addressed harmless Draft create/update; it never sends and waits for visible user confirmation. Existing private `.env`, Keychain data, and earlier Grants are not reused or emitted automatically.

## Risks / Trade-offs

- **External secret stores and SQLite/config cannot share one transaction** → copy-first semantics, typed-ref routing, atomic DB/config writes, retained source values, and idempotent retry keep every crash window readable.
- **Microsoft calendar v1.0 delta is range-bound** → expose a rolling window, anchor it per cursor, periodically full-reconcile, and document/index only declared coverage.
- **Provider sync tokens can expire or be revoked** → preserve a manifest and full-reconcile only after complete scans; never infer deletion from partial provider results.
- **Calendar cursor manifests can grow** → one Source covers one bounded calendar window, manifests store only opaque ids in deterministic order, and size/behavior tests enforce practical bounds.
- **Graph search has provider syntax/limit/eventual-consistency constraints** → support a documented conservative subset, bound pagination, return warnings for degradation, and keep exact retrieval authoritative.
- **Provider identity subjects depend on the OAuth application registration** → deduplicate within stable provider/client identity; changing client registration can require reauthorization and may create a distinct Account.
- **Microsoft tenant policy may require administrator consent or block personal Accounts** → mocked acceptance remains complete; Human checkpoint records a real blocker without weakening scopes or requesting secrets.
- **Gmail compose and Microsoft Mail.ReadWrite are broader than Draft-only behavior** → provider permissions are the narrow available scopes for Draft persistence, while registry, code, egress tests, and Human UI evidence prove no send capability.
- **Immutable Outlook ids have documented lifetime limits** → stable within a mailbox is the contract; archive transfer/reimport is treated as new provider identity rather than guessed deduplication.

## Migration Plan

1. Add V1.1/spec/design artifacts and red architecture/security contracts.
2. Replace secret backend runtime and CLI on fresh isolated state; verify copy/failure/crash windows before changing auth.
3. update fresh canonical schema for Account uniqueness and replace Google-specific auth with provider-neutral declarations/services/account inventory. Existing prototype databases are deleted and recreated; no compatibility migration or alias is added.
4. Add calendar Profile, Google Adapter/mocks, and complete the Google Human checkpoint with fresh exact scopes. Existing Gmail-only Grants are intentionally incompatible because they lack stable identity/calendar scopes.
5. Add Microsoft auth/mail, Drafts, and calendar in separate gated slices, then complete one fresh Microsoft Human checkpoint if app registration/tenant consent is available.
6. Run cross-provider compiled workflows, security/egress/full regression gates, sync capability specs and timeless docs, verify the OpenSpec change and charter, and leave the change active for a separate explicit archive request.

Rollback during development is code rollback plus deletion of disposable isolated databases. Backend movement retains source copies until commit/cleanup, so a failed new version can explicitly switch back before old copies are removed; no automated downgrade compatibility is promised.

## Open Questions

None at artifact completion. Microsoft app registration and tenant consent are expected Human checkpoint prerequisites, not unresolved product decisions. If the stable provider APIs differ from the documented contracts during implementation, the design/spec is amended before behavior changes rather than hidden behind compatibility code.
