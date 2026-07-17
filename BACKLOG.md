# Product backlog

This document records plausible future directions, not committed scope or
accepted behavior. Current behavior remains owned by `openspec/specs/`, while
confirmed defects and selected work belong in GitHub issues.

When a backlog item is selected, narrow it into a focused issue with an
observable outcome and explicit boundaries. Non-trivial work then proceeds on
that issue's branch through an OpenSpec change, implementation, verification,
and archive. Backlog entries may be split, combined, reordered, or dropped
before promotion. The sections below are ordered by the current recommended
sequence, from foundational work to more speculative directions.

## Provider replay and sync endurance testing

Build reusable, privacy-safe regression coverage from sanitized provider
responses. It should exercise pagination, incremental cursors, reconciliation,
tombstones, warnings, attachment hydration, and repeated-sync idempotency
without requiring live accounts in normal automated tests. An opt-in live soak
can complement deterministic replay when longer-running provider validation is
useful.

## Indexed mailbox synchronization

Allow mailbox Sources to maintain local projections rather than relying only
on provider-side discovery. The eventual design should cover incremental
updates, deletions, reconciliation, threads, attachments, and clear consistency
semantics between local and remote retrieval.

## Agent workflow guidance

Continue improving bundled skills as the primary agent-facing workflow layer.
Guidance should help agents discover loaded capabilities and safely perform
common multi-step tasks while deriving exact fields, Actions, authentication
requirements, and configuration from runtime definitions wherever possible.

## Additional provider coverage

Extend the existing Profile and Adapter model where new Sources provide clear
user value or test an important portability boundary. Likely candidates
include:

- cloud files, beginning with either Google Drive or OneDrive;
- contacts;
- standards-based mail and calendar access such as IMAP and CalDAV; and
- collaboration or notification sources such as GitHub, Slack, or Discord.

Each provider should be promoted independently unless shared groundwork makes
a combined change genuinely smaller.

## Push-assisted synchronization

Explore provider webhooks or change notifications to reduce polling and keep
local projections fresher. This should follow dependable cursor,
reconciliation, locking, and recovery behavior so push delivery remains an
optimization rather than a second source of truth.

## Git-backed extension marketplaces

Allow users to add Git repositories that publish discoverable ctxindex
Extensions through a small catalog convention. An official repository could
host reusable Extensions that are useful to multiple users but too specific to
bundle, while teams and individuals could use the same mechanism for their own
repositories.

Catalog entries should point to human setup guidance, including provider-console
steps for obtaining required credentials. Exact authentication requirements,
scopes, and configuration should continue to come from Adapter definitions
rather than parallel marketplace metadata. Explicitly added repositories can
initially be treated as trusted; hosted marketplace infrastructure, social or
commercial features, and a package ecosystem are separate concerns. A future
UI may render the same catalog and setup information without becoming its own
source of truth.

## Interoperability and export formats

Add profile-owned export formats when they unlock a concrete external workflow,
such as calendar interchange or mailbox archives. Prefer focused formats over a
general conversion framework, and keep export semantics with the owning
Profile.

## Advanced retrieval and identity

Consider semantic retrieval after indexed and provider-side search are reliable
and measurable. Cross-source identity resolution and deduplication are a
separate concern: matching rules are domain-specific and should preserve source
provenance rather than silently merging resources.

## Easier authentication onboarding

Explore ways to reduce the work required to configure provider credentials,
including clearer setup guidance and, if justified later, hosted OAuth clients.
Any hosted path introduces operational and security responsibilities and should
remain optional for a local-first deployment.

## Consequential provider Actions

Treat sending mail, mutating calendars, and other externally visible operations
as a distinct trust milestone. Promotion requires an explicit safety model,
least-privilege authorization, confirmation and retry semantics, and strong
evidence that reversible Draft workflows are insufficient for the intended use
case.
