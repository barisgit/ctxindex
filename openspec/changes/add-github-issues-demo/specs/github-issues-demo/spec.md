## ADDED Requirements

### Requirement: Official public GitHub issue definitions
The demo Extension MUST export a stable `github.public` Provider using no authentication, a Provider-bound indexed `github.issues` Source Adapter restricted to `api.github.com`, and a versioned `software.issue` Profile through only the public Extension SDK. Source configuration MUST require an owner and repository, and the Extension MUST remain separate from built-in Extensions.

#### Scenario: Extension graph is loaded
- **WHEN** ctxindex loads the demo package entry
- **THEN** it discovers the Provider, Adapter, Profile, documentation tree, and no OAuth App, credential requirement, or mutation Action

### Requirement: Complete repository issue synchronization
The Adapter MUST call GitHub's official List repository issues REST endpoint for the exact configured owner and repository with `state=all`, `sort=updated`, `direction=desc`, and `per_page=100`. It MUST send recommended GitHub JSON Accept, stable User-Agent, and API-version headers, validate every response body before use, exclude entries carrying `pull_request`, and emit stable issue-number Refs with complete `software.issue` payloads.

The retained payload MUST be limited to issue number, title, optional body, state, label names, created/updated/closed timestamps, and public HTML URL. It MUST exclude actor, assignee, milestone, reaction, and other unnecessary personal or provider metadata.

#### Scenario: Repository contains issues and pull requests
- **WHEN** every response page is valid and pagination completes
- **THEN** the Adapter emits each issue exactly once, excludes pull requests, and commits one final checkpoint after all Resource emissions

### Requirement: Pagination is exact, bounded, and loop-free
The Adapter MUST follow pagination only from a syntactically valid `Link` relation whose `rel` token is exactly `next` and whose target is HTTPS `api.github.com`, has no credentials or fragment, matches the exact configured repository issues path, preserves all fixed collection query parameters, and advances to an unseen positive page. The Adapter MUST reject malformed, ambiguous, relative, escaping, looping, or query-mutating next links.

Synchronization MUST stop successfully only after a page has no next relation. It MUST enforce hard documented limits of at most 100 fetched pages and at most 10,000 accepted issues, and MUST fail when a bound is reached while completion is not proven.

#### Scenario: More than one page is returned
- **WHEN** every next link is exact and the final page has no next link
- **THEN** all pages are validated and the complete issue set is committed once

#### Scenario: Pagination escapes or loops
- **WHEN** a next link targets another host, repository, endpoint, query, prior page, or malformed URL
- **THEN** synchronization fails before any Resource or checkpoint emission

### Requirement: Failure cannot reconcile an incomplete snapshot
The Adapter MUST emit no Resource, removal, or checkpoint until every required page has succeeded and validated. Abort, network failure, malformed JSON or schema, HTTP failure including rate-limit 403 or 429, unsafe pagination, duplication, or a safety-bound failure MUST reject the sync without retry. A failed run MUST therefore leave the previous cursor and materialized Resource set eligible for core's transactional preservation and MUST NOT authorize tombstoning from partial results.

#### Scenario: A later page fails
- **WHEN** an earlier page succeeded but any later page fails or the signal aborts
- **THEN** the operation rejects with no emissions and no retry

### Requirement: ETag reuse is valid only for proven single-page snapshots
The Adapter MUST persist a response ETag for conditional reuse only when a completed snapshot was proven to have exactly one page. It MUST send `If-None-Match` only from such a cursor. A valid `304 Not Modified` MUST complete with no Resource churn and one unchanged checkpoint. A multi-page completed snapshot MUST omit the ETag and fetch the full collection again on the next sync.

#### Scenario: Single-page snapshot is unchanged
- **WHEN** the prior cursor proves one page and GitHub returns 304 to its ETag
- **THEN** the Adapter emits no Resource changes and commits the unchanged snapshot checkpoint

#### Scenario: Multi-page snapshot syncs again
- **WHEN** the prior completed cursor represents multiple pages
- **THEN** the Adapter sends no conditional ETag and fetches every page required for a new complete snapshot

### Requirement: Demo workflow is testable without GitHub access
Automated tests MUST supply mocked network responses and MUST NOT use credentials or contact live GitHub. Coverage MUST include one page, more than 100 returned entries across pages, pull-request filtering, Link validation and loops, single-page ETag 304, multi-page ETag non-reuse, 403 and 429 without retry, abort, malformed payload, atomic final checkpoint behavior, and an isolated local CLI sync/search/get workflow with local `--limit` and `--offset` pagination.

Documentation MUST identify the data source as GitHub's official API rather than scraping, give exact eventual commands for `barisgit/ctxindex`, and give a truthful already-public fallback repository for pre-public testing without claiming live automated verification.

#### Scenario: Repository verification runs offline
- **WHEN** focused and end-to-end tests execute
- **THEN** all provider traffic is handled by deterministic mocks and local search pagination is demonstrated after a complete sync
