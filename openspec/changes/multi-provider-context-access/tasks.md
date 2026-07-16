## 1. V1.1 Contracts and Architecture Guards

- [x] 1.1 Add `V1_1.md` with the multi-provider product outcome, must-ship/deferred scope, dependency-ordered slices, Human checkpoints, and exit criteria; update `SPEC.md`, `IMPLEMENTATION.md`, accepted design D5/D20/D21, and `CONTEXT.md` only where timeless language or resolved domain terms change.
- [x] 1.2 Add failing discovery-based architecture/security tests for provider-neutral core/CLI ownership, `google-mailbox/` and `google-calendar/` sibling provider owners, nested `microsoft/{mailbox,calendar}/` owners with shared provider transport, no raw secret argv options, no silent backend fallback, calendar Profile ownership, allowed provider hosts, and absence of send definitions/routes/scopes.
- [x] 1.3 Validate all proposal/spec/design artifacts strictly and obtain independent design review covering secret crash windows, OAuth scope/identity semantics, calendar window reconciliation, Microsoft immutable identity, and no-send boundaries; correct every important finding before implementation.

### Slice 1 gate

- [x] 1.4 Run strict OpenSpec validation plus focused architecture/doc tests; save reviewed evidence under the active charter before beginning secrets implementation.

## 2. Explicit Secret Backend Operations

- [x] 2.1 Write public-interface red tests for typed-reference Secret Vault routing, configured-backend-only writes, unavailable-backend failure, no value disclosure, and mixed-reference readability.
- [x] 2.2 Implement the deep Secret Vault and correct encrypted-file envelope key-mode selection, private key generation/modes, deterministic backend entry indexing, and central environment resolution without argv secrets.
- [x] 2.3 Write red tests for backend switch success, target copy failure, DB/config failure windows, interruption/retry, source cleanup failure, idempotence, and fresh `init` backend selection.
- [x] 2.4 Implement copy-first crash-safe backend movement and safe status, remove silent fallback plus unused `secrets.passphrase_env`/`paths` plumbing, and keep configuration changes atomic and last.
- [x] 2.5 Replace CLI `secrets migrate` with thin strict `secrets status [--json]` and `secrets backend set <keychain|file>` handlers; reject legacy/passphrase/value-bearing options before dependencies open and update safe formatter/help tests.
- [x] 2.6 Add a real binary sandbox covering fresh Keychain-unavailable init to encrypted file, status non-disclosure, file→mock-Keychain→file movement with auth secret continuity, unavailable target rollback, and zero emitted canaries.

### Slice 2 gate

- [x] 2.7 Run focused secrets/config/init/CLI tests, typecheck, lint, architecture/dependency checks, full unit suite, strict OpenSpec and diff checks; obtain independent security review and save `work/slice-2-secrets-gate.md` before proceeding.

## 3. Provider-neutral OAuth, Accounts, and Grants

- [x] 3.1 Extend the public SDK OAuth declaration under exact public-surface/inference tests with stable provider id, authorization/token/identity metadata, subject/label/typed Account Identity JSON paths, PKCE/client mode, base scopes, environment names, and allowed hosts; validate consistent provider declarations in registries.
- [x] 3.2 Replace token-host provider heuristics with registry-derived provider resolution and exact code-point-sorted Adapter-selected scope unions; add negative tests for empty/unknown/mixed-provider selections, inconsistent descriptors, duplicate scopes, and unselected-scope exclusion.
- [x] 3.3 Update fresh Account schema with stable `(provider, external_user_id)` uniqueness and implement one Account module that atomically upserts identity/label plus deduplicated verified `account_identities`, then returns deterministic nested Account/Grant/Source inventory without secrets.
- [x] 3.4 Replace Google-only AuthService types/SQL with provider-neutral Grant creation/query, typed Vault references, exact granted-scope normalization, stable Account reuse, temporary-secret cleanup, and generic token refresh with refresh-token rotation.
- [x] 3.5 Move loopback authorization into a deep core OAuth module with explicit browser activation, state/callback/timeout validation, S256 PKCE, safe client input, declared endpoint/host enforcement, token/identity response validation, and no out-of-band code path.
- [x] 3.6 Generalize Source Grant compatibility and provider contexts to the declarative provider id/scopes while preserving linked-Grant-only access, one read 401 refresh retry, zero Action retry, sanitized errors, and per-provider host enforcement.

### Slice 3 gate

- [x] 3.7 Run SDK public-surface/factory, registry, Account/Auth/Source/provider-context, storage/migration, network, typecheck/lint/architecture/dependency/full-unit gates; obtain independent review and save `work/slice-3-auth-account-core-gate.md`.

## 4. Agent-first Auth and Account CLI

- [x] 4.1 Add strict red parser/Citty contracts for `auth add <provider> --adapter <id>... (--loopback|--from-env)` and `account list [--json]`, including repeatable Adapter flags, public client-id override, label, mutual exclusion, no literal client-secret/token/code flags, and removal of Google-only `auth list`.
- [x] 4.2 Implement thin auth/account commands over core registry/Auth/Account modules with deterministic safe output, exact scope preview/result, parse-before-deps behavior, close/error/exit handling, and no provider HTTP or SQL in CLI.
- [x] 4.3 Generalize the loopback mock and compiled CLI e2e to prove selected-scope authorization, stable identity Account deduplication across two Grants, one Grant shared by multiple Sources, ambiguity requiring explicit Grant id, malformed input zero I/O, and nested inventory without secrets.
- [x] 4.4 Update registry describe/help/meta tests and workflow guidance to derive OAuth providers, scopes, and safe environment names from loaded definitions without hand-maintained Adapter vocabularies.

### Slice 4 gate

- [x] 4.5 Run focused auth/account parser/handler/binary tests plus typecheck, lint, architecture/dependency, full unit/e2e, strict OpenSpec and diff checks; obtain independent CLI/security review and save `work/slice-4-account-cli-gate.md`.

## 5. Provider-neutral Calendar Profile

- [x] 5.1 Write red Profile tests for timed/all-day discriminated payloads, interval/date ordering, provider identity, organizer/attendees/status/recurrence, strict invalid variants, pure title/summary/occurred-at/search/chunks/typed fields/series Relations, alias, docs, and zero Actions.
- [x] 5.2 Implement `calendar.event@1` in an owned Profiles module with deterministic projections and register/export it through the built-in Extension/public Profile package without calendar branches in core.
- [x] 5.3 Add generic storage/search/get/registry contract tests using fake Google/Microsoft event payloads and stable Source-scoped event Refs, including overlapping Sources remaining distinct and exact Realm filtering.

### Slice 5 gate

- [x] 5.4 Run Profile/registry/generic storage-search-retrieval tests, typecheck/lint/architecture/dependency/full unit, strict OpenSpec and diff checks; independently review Profile semantics and save `work/slice-5-calendar-profile-gate.md`.

## 6. Google Calendar Adapter

- [x] 6.1 Add an owned `google-calendar` module, strict generated config (`calendar_id`, positive past/future days), shared Google provider declaration, narrow read scope, indexed sync/retrieve capabilities, built-in registration, and stateful loopback Calendar mock without write routes.
- [x] 6.2 Implement/test strict Google event/page schemas, timed/all-day/attendee/organizer/recurrence normalization, HTML-safe text handling, stable event/series Refs, deterministic warnings, and provider error taxonomy.
- [x] 6.3 Implement one-page then multi-page full sync tracer tests with anchored window, expanded instances, deleted visibility, code-point-sorted emissions/manifest, final-token-only checkpoint, cancellation, and no cursor advance on partial failure.
- [x] 6.4 Implement/test incremental token sync, paged changes, deletion tombstones, invalid-cursor and HTTP 410 bounded full reconciliation, config/monthly window roll, resync/diff behavior, and no guessed removals after uncertainty.
- [x] 6.5 Implement/test canonical same-Source retrieval, selected-calendar confinement, complete generic Resource emission, 404/bad-response taxonomy, exact linked Grant, bounded 401 retry, and cross-provider/foreign Ref zero I/O.
- [x] 6.6 Add a real binary sandbox proving one Account/Grant with named Gmail and Google Calendar Sources, exact scopes, calendar sync→search/get, unchanged incremental sync, update/delete/window reconciliation, exact Realm filtering, account/source inventory, and no Calendar mutation/Google cross-service egress.

### Slice 6 mocked gate

- [x] 6.7 Run Google Calendar/Profile/Auth/Sync focused and integration/e2e tests, provider egress/no-write gates, D3, typecheck/lint/architecture/dependency/full suites, strict OpenSpec/diff; obtain independent review and save `work/slice-6-google-calendar-mocked-gate.md`.

### Human checkpoint: Google mailbox and calendar

- [x] 6.8 Prepare a fresh ignored isolated checkpoint and exact Google mailbox+calendar scope/payload/read plan, then pause before browser login/consent. After explicit approval, create one compatible Grant and named mailbox/calendar Sources, perform bounded harmless mailbox/calendar search/get only, preserve redacted evidence, and mark complete only after user confirms the expected Account/Sources and no provider mutation.

## 7. Microsoft Identity and Mailbox Reads

- [x] 7.1 Add central Microsoft environment/loopback configuration, shared declarative provider metadata for `common` personal+organizational auth, S256 PKCE/public-client mode, exact base scopes/hosts, token+identity schemas, and stateful mock token refresh/rotation/Graph identity endpoints.
- [x] 7.2 Prove the same core OAuth flow authorizes Microsoft personal/work fixture identities, reuses stable Accounts, stores exact selected scopes, rotates refresh tokens safely, rejects malformed/insufficient responses with cleanup, and never contacts Google hosts.
- [x] 7.3 Add provider-owned `microsoft/mailbox` definition/config/transport modules with `communication.message@1`, `Mail.ReadWrite` reserved for Slice 8 Draft bindings, federated search/retrieve/download, immutable-id/text-body preference headers, and no Microsoft SDK dependency.
- [x] 7.4 Implement/test bounded Graph message `$search`/KQL translation for supported text/time/typed fields, strict escaping/paging/response schemas, client-side Draft exclusion (because Graph `$search` cannot combine with `$filter`), immutable stable Refs, deterministic normalization/warnings, and provider error/rate-limit taxonomy.
- [x] 7.5 Implement/test complete message retrieval, text body/address/header normalization, conversation/RFC Relations, immutable identity across simulated folder moves, canonical Ref validation, 404/bad-response behavior, and generic materialization/thread traversal.
- [x] 7.6 Implement/test attachment metadata pagination and managed Artifact descriptors, file `$value` streaming/cache reuse, immutable attachment ids, unsupported attachment warnings, size/media/name validation, and malformed/foreign Artifact zero I/O.
- [x] 7.7 Add compiled CLI e2e for Microsoft auth/account inventory, Outlook remote search/get/thread, attachment miss/hit/exact bytes, EML+JSON export, Realm isolation, provider degradation, and no provider-specific CLI/core path.

### Slice 7 gate

- [x] 7.8 Run Microsoft auth/mail/retrieval/artifact focused and integration/e2e tests, provider/network gates, typecheck/lint/architecture/dependency/full suites, strict OpenSpec/diff; independently review Graph/API/schema/identity fidelity and save `work/slice-7-microsoft-mail-gate.md`.

## 8. Outlook Draft Actions

- [ ] 8.1 Add red direct/`runAction` tests for Outlook Draft create: complete input validation before I/O, exactly one Graph `POST /me/messages`, immutable-id response, stable canonical Draft Ref, complete normalized Resource, one local materialization, and no retry/follow-up mutation.
- [ ] 8.2 Implement Draft create behind the existing communication Action binding and add provider error/response/recipient/body replacement tests including non-ASCII text and header-injection rejection.
- [ ] 8.3 Add red direct/`runAction` tests for update: exact uppercase Source authority/raw canonical Ref prevalidation, one `PATCH /me/messages/{id}`, explicit complete replacement/clearing of to/cc/bcc/subject/text, same immutable Draft Ref, absent-local materialization, and zero I/O for foreign/non-Draft refs.
- [ ] 8.4 Implement Draft update and stateful mock create→update; add negative registry/describe/unknown-send tests locking exactly the two reversible Actions, `Mail.ReadWrite` present, `Mail.Send` absent, mutation methods exactly POST/PATCH, and no `/send` route.
- [ ] 8.5 Add real binary Outlook Draft e2e covering invalid input zero requests/resources, one create, one update, stable Ref/full replacement/cached get, account/source inventory, export, and unknown send zero requests.

### Slice 8 gate

- [ ] 8.6 Run all Action/Profile/Microsoft Draft focused, integration/e2e, no-send/egress, D3, typecheck/lint/architecture/dependency/full suites, strict OpenSpec/diff; obtain adversarial mutation/security review and save `work/slice-8-outlook-draft-gate.md`.

## 9. Microsoft Calendar Adapter

- [ ] 9.1 Add provider-owned `microsoft/calendar` definition/config with one default/explicit calendar, positive rolling window, `calendar.event@1`, `Calendars.Read`, indexed sync/retrieve, built-in registration, and stateful Graph mocks for default-calendar v1.0 delta plus named-calendar v1.0 full window scans, without beta or write routes.
- [ ] 9.2 Implement/test strict Graph event/delta schemas and normalization using immutable ids plus UTC response preference while preserving original zones, all-day ranges, attendees/organizer/status/recurrence/series identity, removed entries, and deterministic warnings.
- [ ] 9.3 Implement/test default-calendar fixed-window initial/multi-page delta sync, opaque next/delta URL validation, manifest/final-link checkpoint, incremental changes/deletions and expired/invalid link reconciliation; implement/test named-calendar complete paged v1.0 window scans with manifest reconciliation and no delta cursor; cover monthly/config/resync window roll, diff, cancellation, and partial-failure preservation for both strategies.
- [ ] 9.4 Implement/test calendar-scoped canonical retrieval with stable Ref, linked Grant/host confinement, complete event emission, 404/bad-response taxonomy, and foreign Source/calendar zero I/O.
- [ ] 9.5 Extend compiled multi-provider e2e with named personal Google and work Microsoft calendar Sources, sync/search/get across both, exact Realm filters, overlapping event identity isolation, update/delete/window behavior, Account inventory, and no calendar mutation Actions/routes/scopes.

### Slice 9 gate

- [ ] 9.6 Run Microsoft/Google calendar/Profile/sync focused and integration/e2e tests, provider no-write/egress gates, D3, typecheck/lint/architecture/dependency/full suites, strict OpenSpec/diff; independently review delta/window/time semantics and save `work/slice-9-microsoft-calendar-gate.md`.

## 10. Cross-provider Product Workflow and Human Acceptance

- [ ] 10.1 Add one relocated compiled CLI workflow representing personal Gmail, personal Google Calendar, work Gmail, work Outlook, work Microsoft Calendar, and a local directory across explicit Realms; prove account/source listings, all-Realm and exact-Realm search, mail/event/file get, threads, attachment cache, exports, Gmail+Outlook Draft create/update, deterministic JSON, and no send.
- [ ] 10.2 Strengthen global network/redaction/security gates to discover every production provider request helper/test, require only approved Google/Microsoft hosts and loopback mocks, forbid direct fetch, scan scopes/Action ids/routes for send, preserve canary redaction, and prove malformed commands perform zero auth/network/storage.
- [ ] 10.3 Update generated describe/help, bundled skills, `docs/AGENT-HOWTOS.md`, `.env.example`, packaging notes, command inventory, architecture/dependency manifests, recursive test gates, and codemaps without duplicating registry/provider truth.

### Human checkpoint: Microsoft mail, calendar, and Draft

- [ ] 10.4 Prepare ignored isolated state plus exact Microsoft app-registration requirements, delegated scopes, account/source plan, harmless read queries and self-addressed Draft create/update payload; pause before registration/login/consent and again before mutations. After explicit approvals, run bounded mailbox/calendar reads and exactly one Draft create/update, never send, preserve redacted evidence, and pause for user UI confirmation that the updated Draft exists and nothing was sent.

## 11. Final Verification and Handoff

- [ ] 11.1 Run focused provider/account/secrets suites, complete unit/integration/e2e, frozen install/build, relocated compiled workflows/skills/external Extension, CI, D3, generated-schema drift, typecheck, lint, architecture/dependency/network gates, strict OpenSpec and diff on one settled snapshot; fix every failure and save `work/final-automated-gate.md`.
- [ ] 11.2 Run incremental cartography and a four-way drift sweep across `CONTEXT.md`, `SPEC.md`, `V1.md`/`V1_1.md`, `IMPLEMENTATION.md`, accepted design, active/main OpenSpec specs, generated interface/help/skills, codemaps, manifests, and production structure; correct only demonstrated drift and save evidence.
- [ ] 11.3 Obtain independent standards/security and specification/API reviews over the final diff; correct all critical/important findings, rerun affected gates, and save review evidence.
- [ ] 11.4 Run fresh-context black-box QA over secret status/switch, Account inventory, selected-scope auth mocks, multi-Realm provider workflow, both calendar syncs, Outlook read/attachment/export/Drafts, no-send/exit taxonomy, relocated binary, and D3 without live provider traffic.
- [ ] 11.5 Run `openspec-verify-change`, synchronize approved deltas into main capability specs, update final milestone/charter evidence, rerun strict validation, curate/complete the charter, and leave this change active and unarchived for a separate explicit archive request.
