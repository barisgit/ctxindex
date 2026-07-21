## Context

The repository already has a guaranteed offline tenders fixture and compact authoring examples, but no official demo that reads real public data. The new demo must remain an ordinary external Extension, use GitHub's documented REST surface rather than scraping, work without credentials, preserve complete-snapshot reconciliation semantics, and never make live requests in automated tests.

## Goals / Non-Goals

**Goals:**

- Demonstrate a public no-auth Provider-backed indexed sync through the public SDK.
- Make pagination and failure behavior safe enough that a partial GitHub response cannot become a successful local snapshot.
- Minimize retained provider data and give users truthful commands for both the eventual project repository and an already-public fallback.

**Non-Goals:**

- GitHub authentication, private repositories, comments, pull requests, reactions, users, mutations, or remote search.
- Turning the demo into a built-in Extension or changing the launch website in this branch.
- Relying on a first-page ETag to validate a previously multi-page collection.

## Decisions

GitHub's List repository issues endpoint is used with `state=all`, `sort=updated`, `direction=desc`, and `per_page=100`. Pull requests are excluded because GitHub deliberately returns them from the issues endpoint but the Profile contract is for issues.

The Adapter gathers and validates all pages before emitting Resources or the single final checkpoint. Core is already transactional, but buffering also makes the Extension-level contract observable and prevents any partial emission stream from looking reconcilable outside the coordinator.

Each `Link` next target is parsed as a URL and accepted only when it is HTTPS on `api.github.com`, has no credentials or fragment, matches the exact encoded configured `/repos/{owner}/{repository}/issues` path, preserves the fixed collection query, and advances to a unique positive page. Relative, alternate-host, alternate-repository, malformed, looping, and query-mutating links fail the run.

The demo uses conservative hard limits of 100 pages and 10,000 accepted issues. Reaching either limit while more data may exist fails rather than committing an incomplete snapshot.

A cursor records snapshot issue numbers and, only for a proven single-page completed collection, that first response's ETag. A future sync may send `If-None-Match` only for such a cursor. A `304` then commits the unchanged cursor without Resource churn. Multi-page cursors deliberately omit the ETag and always paginate again because GitHub documents response validators, not a collection-wide validator spanning arbitrary pages.

## Risks / Trade-offs

- Unauthenticated GitHub API traffic has a low shared rate limit. The demo makes no retry and reports 403/429 clearly so users can wait or choose a smaller repository.
- Buffering 10,000 normalized issues increases peak memory. The hard bound keeps it finite and favors atomicity and demo correctness.
- Reconciliation needs the preceding issue numbers in the cursor. This grows the cursor but remains bounded and avoids retaining unnecessary provider payload.
- Public issue bodies may contain authored personal data. The Extension stores only issue content and labels needed for discovery, excluding actor, assignee, milestone, and reaction records.

## Migration Plan

Not applicable. This adds a private example package and no deployed or user state migration.

## Open Questions

None.
