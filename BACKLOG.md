# Product backlog

This is a list of plausible next investments, not committed scope. Current
behavior lives in [`openspec/specs/`](openspec/specs/); accepted defects and
selected work belong in GitHub issues. Promote one item at a time into an issue
with an observable outcome, explicit non-goals, and an OpenSpec change when it
alters a stable contract.

## Reliability before breadth

- Build privacy-safe provider replay fixtures for pagination, cursors,
  reconciliation, tombstones, attachments, and repeated-sync idempotency.
- Add longer daemon, sync, and storage endurance runs without making live
  accounts part of normal CI.
- Improve failure recovery and diagnostics using bounded, redacted evidence.

## More useful Sources

Prioritize adapters that validate the portability of the existing Provider,
Profile, and Source Adapter model:

- cloud files: Google Drive and OneDrive;
- standards-based mail and calendars: IMAP and CalDAV;
- contacts; and
- collaboration and notifications: GitHub, Slack, Discord, and similar tools.

Each adapter should ship independently unless shared groundwork genuinely makes
a combined change smaller.

## Fresher local context

Explore provider webhooks or change notifications after cursor,
reconciliation, locking, and recovery are dependable. Push delivery should wake
daemon-owned synchronization; it must remain an optimization over provider
state, not a second source of truth.

## Better retrieval and interoperability

- Add Profile-owned exports when a concrete workflow needs them, such as
  calendar interchange or mailbox archives.
- Evaluate semantic retrieval only after indexed and provider search are
  reliable and measurable.
- Treat cross-source identity resolution as a separate, provenance-preserving
  concern; never silently merge Resources.

## Daemon operations beyond one machine

The local daemon, automatic lifecycle, typed streaming, and single-owner storage
are current architecture. Separate future changes may add:

- service-manager installation or login startup;
- backup automation and stronger local-client authentication;
- remote authenticated access, batching, or an OpenAPI-generated SDK; and
- background scheduling or a durable job queue, if concrete workloads require
  one.

## Consequential Actions

Sending mail, mutating calendars, and other externally visible operations are a
new trust milestone. Promotion requires least-privilege authorization, explicit
confirmation, idempotency and retry semantics, auditability, and evidence that
reversible Draft workflows are insufficient.

## Hosted conveniences

The website, local Catalog marketplace, installable CLI, and managed Google and
Microsoft OAuth App definitions already exist. Hosted account services,
cross-device state, or a hosted marketplace would change the local-first trust
model and must be justified and specified independently rather than growing out
of those features by accident.
