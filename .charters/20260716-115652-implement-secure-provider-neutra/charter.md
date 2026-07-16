# Charter: Multi-provider Accounts, Calendar, and Outlook

## Objective

Deliver a secure, agent-first multi-provider context layer in which one person can inspect and use multiple Google and Microsoft Accounts across Realms; safely select and migrate the configured secrets backend; index and retrieve Google and Microsoft calendar events; search and retrieve Outlook mail; and create/update provider-persisted Outlook Drafts without any send capability. Preserve ctxindex's provider-neutral Profiles, generic storage/search/Action paths, stable Refs, deterministic CLI, and explicit Human consent checkpoints.

## References

- `CONTEXT.md`
- `SPEC.md`
- `V1.md`
- `V1_1.md`
- `IMPLEMENTATION.md`
- `docs/design/2026-07-13-context-access-layer.md`
- `openspec/changes/multi-provider-context-access/`

## Scope

In scope: safe Keychain/encrypted-file backend selection and migration; provider-neutral Account/Grant lifecycle and inventory; exact Adapter-selected OAuth scopes; Google Calendar; Microsoft identity OAuth; Microsoft Graph mailbox/calendar reads; Outlook Draft create/update; isolated mocked and approved live checkpoints.

Out of scope: sending mail, calendar mutations, on-premises Exchange, arbitrary provider Actions, automatic cross-source deduplication, silent secret-backend fallback, and compatibility with disposable prototype databases or CLI aliases.

## Criteria

### C1. Normative scope and domain language are coherent
The milestone, OpenSpec artifacts, and domain documents define provider-neutral Accounts, Grants, calendar Resources, secrets behavior, Microsoft Graph scope, and mutation limits without duplicating or contradicting the timeless specification.
Status: pass — reverified 2026-07-16 after completed live Google checkpoint: strict change/all OpenSpec validation and final CI pass with the accepted scope/design; see `work/slice-1-contract-gate.md` and `work/slice-6-google-calendar-mocked-gate.md`

### C2. Secret backend operation is explicit and safe
The CLI can report the active backend without exposing secret values and explicitly switch between OS Keychain and encrypted file storage. It never silently falls back, never accepts passphrases in argv, does not strand references if a switch fails, and persists the selected backend only after successful movement.
Depends: C1
Status: pass — reverified 2026-07-16 after completed live Google checkpoint: final CI/full suite retain explicit typed backends, no fallback/literal-secret CLI, and crash-safe switching; see `work/slice-2-secrets-gate.md`

### C3. Accounts and Grants are provider-neutral and deduplicated
Google and Microsoft authorization resolve a stable external identity, upsert exactly one Account per provider identity, retain explicit Grants and scope sets, and allow multiple Sources to reuse a compatible Grant without duplicate Accounts.
Depends: C1, C2
Status: in-progress — completed live Google checkpoint proves one stable Account, one exact compatible Grant, and two named Sources sharing it without broader scopes; Microsoft personal/work subject proof remains in Slice 7; see `work/google-human-checkpoint-live.md`

### C4. Agents can inspect configured Accounts and Sources
A deterministic `account list` interface exposes safe nested Account, Grant, scope, Realm, and Source information in readable and JSON forms, while `source list` remains the canonical inventory including unauthenticated Sources. No secret material is rendered or logged.
Depends: C3
Status: pass — reverified 2026-07-16 after completed live Google checkpoint: compiled and live inventories list one Account/Grant with named Realm/Source bindings, exact scopes, and no subject/secret evidence; see `work/slice-6-google-calendar-mocked-gate.md` and `work/google-human-checkpoint-live.md`

### C5. Calendar events use one provider-neutral Profile
A strict `calendar.event@1` Profile represents timed and all-day events, organizers, attendees, recurrence, status, location, description, provider calendar identity, typed fields, chunks, and stable relations without provider-specific core/storage paths.
Depends: C1
Status: pass — reverified 2026-07-16 after completed live Google checkpoint: strict Profile/integration/Adapter/full tests plus one live generic Calendar search/get pass exact Refs and generic paths; see `work/slice-5-calendar-profile-gate.md`, `work/slice-6-google-calendar-mocked-gate.md`, and `work/google-human-checkpoint-live.md`

### C6. Google Calendar is a complete read Source Adapter
A configured Google Calendar Source uses exact selected scopes and supports deterministic incremental sync, pagination, tombstones, invalid-cursor recovery, retrieval, stable Source-scoped Refs, and generic search/get over selected calendars with no calendar mutation capability.
Depends: C3, C5
Status: pass — reverified 2026-07-16 after completed live Google checkpoint: final CI/mocked suites/reviews and approved live sync/search/get prove reconciliation/retrieve, exact Grant/scopes/Realms, and read-only egress; see `work/slice-6-google-calendar-mocked-gate.md` and `work/google-human-checkpoint-live.md`

### C7. Google multi-Source consent works live
At an explicit Human checkpoint, one approved Google Account can authorize the exact requested mailbox/calendar scopes, reuse one compatible Grant across named mailbox and calendar Sources, and expose the exact approved harmless live mailbox and calendar search/get evidence without leaking credentials or mutating provider state.
Depends: C6
Status: pass — user explicitly approved and completed consent; one compatible Grant and named mailbox/calendar Sources pass exact inventory, bounded Gmail search/get and Calendar sync/search/get, with redacted evidence and no ctxindex provider mutation; see `work/google-human-checkpoint-live.md`

### C8. Microsoft authorization supports personal and work Accounts
The Microsoft identity flow supports approved Outlook.com and Microsoft 365 Accounts through authorization code with PKCE/loopback semantics, exact Adapter-selected delegated scopes, refresh, stable external identity, deterministic errors, and no broader permissions than loaded selected Sources require.
Depends: C2, C3
Status: pending

### C9. Outlook mail uses the communication Profile
The Microsoft mailbox Adapter supports provider-side discovery, complete retrieval, conversation relations, attachments and exports through the existing `communication.message@1` contract, stable immutable provider IDs, deterministic pagination/errors, and generic materialization with no provider-specific core path.
Depends: C8
Status: pending

### C10. Outlook Drafts are reversible and never sent
The existing provider-neutral Draft create/update Actions bind to Microsoft mailbox Sources, request `Mail.ReadWrite` but never `Mail.Send`, perform one non-retried provider mutation per invocation, preserve a stable Draft Ref across update, validate complete replacement input before I/O, and expose no send Action or endpoint.
Depends: C9
Status: pending

### C11. Microsoft Calendar is a complete read Source Adapter
A Microsoft Calendar Source emits the same `calendar.event@1` Resources as Google through incremental delta sync/retrieval with stable IDs, tombstones, recurrence/time-zone fidelity, selected calendar configuration, and no calendar mutation capability.
Depends: C5, C8
Status: pending

### C12. Provider egress and secrets remain bounded
Automated gates prove Google operations contact only Google hosts, Microsoft operations only approved identity/Graph hosts, local Sources make no network requests, mutation routes never include send, logs/diagnostics redact credentials, and malformed input performs zero auth/provider/storage work.
Depends: C6, C9, C10, C11
Status: pending

### C13. Multi-account workflow is useful end to end
A real compiled CLI in isolated state can represent personal Gmail, personal Google Calendar, work Gmail, work Outlook, and work Microsoft Calendar as explicitly named Sources in chosen Realms; list Accounts/Sources; search all or an exact Realm; retrieve mail/events/attachments; and create/update one Outlook Draft through generic commands.
Depends: C4, C6, C9, C10, C11
Status: pending

### C14. Generated interface and agent guidance remain authoritative
Registry-derived `describe`, help, bundled skills, and workflow documentation expose the new Profiles, Adapters, configuration, scopes, Actions, and Account/secrets commands without parallel hand-maintained provider vocabularies or interactive credential prompts.
Depends: C2, C4, C6, C9, C10, C11
Status: pending

### C15. Mocked, live, packaging, and regression gates pass
Focused tests, integration/e2e suites, compiled/relocated binary checks, D3 external Extension proof, typecheck, lint, dependency/architecture checks, strict OpenSpec validation, drift/cartography, independent review, fresh-context QA, and explicit Human Google/Microsoft checkpoints all pass on the final snapshot with no unapproved live traffic.
Depends: C7, C12, C13, C14
Status: pending
