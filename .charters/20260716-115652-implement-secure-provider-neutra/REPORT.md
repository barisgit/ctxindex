# Charter Report

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

Status: pass — reverified 2026-07-16 on the settled snapshot: strict OpenSpec validation, drift sweep, final independent reviews, and synchronized main specs are coherent; see `work/final-drift-sweep.md`, `work/final-independent-reviews.md`, `work/final-openspec-verification.md`, and `work/final-openspec-sync.md`

### C2. Secret backend operation is explicit and safe

The CLI can report the active backend without exposing secret values and explicitly switch between OS Keychain and encrypted file storage. It never silently falls back, never accepts passphrases in argv, does not strand references if a switch fails, and persists the selected backend only after successful movement.

Depends: C1
Status: pass — reverified 2026-07-16 on the settled snapshot: explicit typed backends, no fallback or argv secret input, crash-safe switching, and black-box backend workflows pass; see `work/slice-2-secrets-gate.md`, `work/final-automated-gate.md`, and `work/final-black-box-qa.md`

### C3. Accounts and Grants are provider-neutral and deduplicated

Google and Microsoft authorization resolve a stable external identity, upsert exactly one Account per provider identity, retain explicit Grants and scope sets, and allow multiple Sources to reuse a compatible Grant without duplicate Accounts.

Depends: C1, C2
Status: pass — reverified 2026-07-16 on the settled snapshot: provider-neutral identity, Account reuse, exact Grants, refresh rotation, shared Sources, and both live providers are proven; see `work/slice-7-microsoft-mail-gate.md`, `work/google-human-checkpoint-live.md`, and `work/microsoft-human-checkpoint-live.md`

### C4. Agents can inspect configured Accounts and Sources

A deterministic `account list` interface exposes safe nested Account, Grant, scope, Realm, and Source information in readable and JSON forms, while `source list` remains the canonical inventory including unauthenticated Sources. No secret material is rendered or logged.

Depends: C3
Status: pass — reverified 2026-07-16 on the settled snapshot: deterministic Account/Grant/Source/Realm inventory remains credential-safe in compiled, black-box, and live evidence; see `work/slice-10-product-workflow-gate.md`, `work/final-black-box-qa.md`, and both live checkpoint reports

### C5. Calendar events use one provider-neutral Profile

A strict `calendar.event@1` Profile represents timed and all-day events, organizers, attendees, recurrence, status, location, description, provider calendar identity, typed fields, chunks, and stable relations without provider-specific core/storage paths.

Depends: C1
Status: pass — reverified 2026-07-16 on the settled snapshot: one strict provider-neutral Calendar Profile drives Google and Microsoft sync, search, and retrieval; see `work/slice-5-calendar-profile-gate.md`, `work/slice-9-microsoft-calendar-gate.md`, and `work/final-openspec-verification.md`

### C6. Google Calendar is a complete read Source Adapter

A configured Google Calendar Source uses exact selected scopes and supports deterministic incremental sync, pagination, tombstones, invalid-cursor recovery, retrieval, stable Source-scoped Refs, and generic search/get over selected calendars with no calendar mutation capability.

Depends: C3, C5
Status: pass — reverified 2026-07-16 on the settled snapshot: Google Calendar paging, reconciliation, retrieval, exact scopes, bounded egress, and live reads pass; see `work/slice-6-google-calendar-mocked-gate.md`, `work/google-human-checkpoint-live.md`, and `work/final-black-box-qa.md`

### C7. Google multi-Source consent works live

At an explicit Human checkpoint, one approved Google Account can authorize the exact requested mailbox/calendar scopes, reuse one compatible Grant across named mailbox and calendar Sources, and expose the exact approved harmless live mailbox and calendar search/get evidence without leaking credentials or mutating provider state.

Depends: C6
Status: pass — reverified 2026-07-16 on the settled snapshot: the approved Google checkpoint used one compatible Grant across named mailbox/calendar Sources with bounded reads and no provider mutation; see `work/google-human-checkpoint-live.md`

### C8. Microsoft authorization supports personal and work Accounts

The Microsoft identity flow supports approved Outlook.com and Microsoft 365 Accounts through authorization code with PKCE/loopback semantics, exact Adapter-selected delegated scopes, refresh, stable external identity, deterministic errors, and no broader permissions than loaded selected Sources require.

Depends: C2, C3
Status: pass — reverified 2026-07-16 on the settled snapshot: Microsoft common/public S256 auth supports personal/work identity, exact scopes, safe refresh rotation, and bounded hosts; see `work/slice-7-microsoft-mail-gate.md` and `work/final-openspec-verification.md`

### C9. Outlook mail uses the communication Profile

The Microsoft mailbox Adapter supports provider-side discovery, complete retrieval, conversation relations, attachments and exports through the existing `communication.message@1` contract, stable immutable provider IDs, deterministic pagination/errors, and generic materialization with no provider-specific core path.

Depends: C8
Status: pass — reverified 2026-07-16 on the settled snapshot: Outlook discovery, complete retrieval, Relations, immutable Refs, artifacts, cache, and exports pass generic paths; see `work/slice-7-microsoft-mail-gate.md`, `work/final-automated-gate.md`, and `work/final-black-box-qa.md`

### C10. Outlook Drafts are reversible and never sent

The existing provider-neutral Draft create/update Actions bind to Microsoft mailbox Sources, request `Mail.ReadWrite` but never `Mail.Send`, perform one non-retried provider mutation per invocation, preserve a stable Draft Ref across update, validate complete replacement input before I/O, and expose no send Action or endpoint.

Depends: C9
Status: pass — reverified 2026-07-16 on the settled snapshot: Gmail and Outlook Draft create/update remain reversible one-shot mutations with no send scope, Action, or route; see `work/slice-8-outlook-draft-gate.md`, `work/microsoft-human-checkpoint-live.md`, and `work/final-independent-reviews.md`

### C11. Microsoft Calendar is a complete read Source Adapter

A Microsoft Calendar Source emits the same `calendar.event@1` Resources as Google through incremental delta sync/retrieval with stable IDs, tombstones, recurrence/time-zone fidelity, selected calendar configuration, and no calendar mutation capability.

Depends: C5, C8
Status: pass — reverified 2026-07-16 on the settled snapshot: stable Microsoft Calendar delta/named scans, retrieval, exact Realms, bounded read scope, and no write route pass; see `work/slice-9-microsoft-calendar-gate.md`, `work/microsoft-human-checkpoint-live.md`, and `work/final-openspec-verification.md`

### C12. Provider egress and secrets remain bounded

Automated gates prove Google operations contact only Google hosts, Microsoft operations only approved identity/Graph hosts, local Sources make no network requests, mutation routes never include send, logs/diagnostics redact credentials, and malformed input performs zero auth/provider/storage work.

Depends: C6, C9, C10, C11
Status: pass — reverified 2026-07-16 on the settled snapshot: exact host/mock ownership, redirect and loopback confinement, redaction, per-Account bearer isolation, malformed zero-side-effect, and no-send gates pass; see `work/final-automated-gate.md`, `work/final-drift-sweep.md`, and `work/final-independent-reviews.md`

### C13. Multi-account workflow is useful end to end

A real compiled CLI in isolated state can represent personal Gmail, personal Google Calendar, work Gmail, work Outlook, and work Microsoft Calendar as explicitly named Sources in chosen Realms; list Accounts/Sources; search all or an exact Realm; retrieve mail/events/attachments; and create/update one Outlook Draft through generic commands.

Depends: C4, C6, C9, C10, C11
Status: pass — reverified 2026-07-16 on the settled snapshot: the relocated binary and fresh black-box QA prove multi-Account, multi-Realm mail/calendar/files workflows, artifacts/exports, and reversible Drafts; see `work/slice-10-product-workflow-gate.md` and `work/final-black-box-qa.md`

### C14. Generated interface and agent guidance remain authoritative

Registry-derived `describe`, help, bundled skills, and workflow documentation expose the new Profiles, Adapters, configuration, scopes, Actions, and Account/secrets commands without parallel hand-maintained provider vocabularies or interactive credential prompts.

Depends: C2, C4, C6, C9, C10, C11
Status: pass — reverified 2026-07-16 on the settled snapshot: generated registries/help, agent guidance, environment schema, packaging, architecture manifests, and synchronized capability specs are authoritative; see `work/final-drift-sweep.md`, `work/final-openspec-sync.md`, and `work/final-black-box-qa.md`

### C15. Mocked, live, packaging, and regression gates pass

Focused tests, integration/e2e suites, compiled/relocated binary checks, D3 external Extension proof, typecheck, lint, dependency/architecture checks, strict OpenSpec validation, drift/cartography, independent review, fresh-context QA, and explicit Human Google/Microsoft checkpoints all pass on the final snapshot with no unapproved live traffic.

Depends: C7, C12, C13, C14
Status: pass — final settled 2026-07-16 evidence includes 12/12 CI gates with 945 tests, clean drift/cartography, two independent reviews with no critical/important findings, ten first-run black-box workflows plus Bun 1.3.14 D3, approved redacted Google/Microsoft checkpoints, 33/33 verified delta requirement headings, and ten synchronized main specs; see `work/final-automated-gate.md`, `work/final-drift-sweep.md`, `work/final-independent-reviews.md`, `work/final-black-box-qa.md`, `work/final-openspec-verification.md`, and `work/final-openspec-sync.md`

## Artifacts

- work/final-automated-gate.md
- work/final-black-box-qa.md
- work/final-drift-sweep.md
- work/final-independent-reviews.md
- work/final-openspec-sync.md
- work/final-openspec-verification.md
- work/google-human-checkpoint-live.md
- work/google-human-checkpoint-plan.md
- work/microsoft-human-checkpoint-live.md
- work/microsoft-human-checkpoint-plan.md
- work/slice-1-contract-gate.md
- work/slice-10-product-workflow-gate.md
- work/slice-2-secrets-gate.md
- work/slice-3-auth-account-core-gate.md
- work/slice-4-account-cli-gate.md
- work/slice-5-calendar-profile-gate.md
- work/slice-6-google-calendar-mocked-gate.md
- work/slice-7-microsoft-mail-gate.md
- work/slice-8-outlook-draft-gate.md
- work/slice-9-microsoft-calendar-gate.md

## Summary

V1.1 is complete. ctxindex now provides explicit, crash-safe secret backend operations; provider-neutral OAuth, Accounts, Grants, and safe inventory; one strict calendar Profile with read-only Google and Microsoft Calendar Adapters; Outlook mailbox retrieval, Relations, managed attachments, cache, and exports; and provider-neutral Gmail/Outlook Draft create/update without any send capability.

The settled relocated CLI workflow represents three provider Accounts and six named provider/filesystem Sources across exact Realms. Approved Google and Microsoft checkpoints proved bounded live reads and one unsent Outlook Draft create/update. The Microsoft provider returned a broader cumulative `Calendars.ReadWrite` scope than requested; evidence records this, while the product still requests `Calendars.Read`, exposes no Calendar Action, and has no Calendar mutation route.

Final evidence passed 12/12 CI gates with 945 tests, clean drift and cartography, two independent reviews with no critical or important findings, ten first-run black-box workflows plus the Bun 1.3.14 D3 proof, 33/33 verified OpenSpec delta requirement headings, and synchronization of all ten delta capabilities into the main specs.

`V1_1.md` is marked complete. The OpenSpec change intentionally remains active and unarchived; archival requires a separate explicit request.
