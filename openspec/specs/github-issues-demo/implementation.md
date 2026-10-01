# GitHub Issues Demo Implementation

## Ownership

The external example workspace owns the `github.public` Provider, `github.issues` Adapter, `software.issue@1` Profile, strict repository Source configuration, request construction, provider-response normalization, pagination validation, and sync operation. Its `ctxindex.github-issues-demo` Extension entry remains a plain public-SDK composition root and is not activated as a built-in.

Provider-neutral core owns transactional emission application, sync-run history, cursor durability, local indexing and search, retrieval by Ref, and egress enforcement from the Adapter's declared host.

## Stable interfaces and data flow

The Adapter receives only the public sync operation context and strict `{ owner, repository }` configuration. It builds the canonical GitHub issues collection URL, uses injected `fetch` and `signal`, validates and buffers the bounded complete page graph, normalizes the retained payload, and then emits complete Resources, removals derived from prior membership, and one final checkpoint.

The private pagination seam returns only an exact validated next URL for the configured repository. Failures reject the operation boundary; no provider-specific behavior or GitHub response object enters core or the CLI.

## State and security

Core owns durable Resource, search-index, run, and cursor state. The versioned Adapter cursor contains sorted complete issue-number membership, completed page count, and an optional ETag only for a proven one-page snapshot. Raw provider pages remain ephemeral.

The Provider uses no auth and the Adapter declares only `api.github.com` egress. Pagination rejects alternate schemes, hosts, ports, credentials, fragments, paths, repositories, query shapes, repeated pages, and non-advancing pages. The retained payload excludes actor, assignee, milestone, reaction, and unrelated provider metadata. The package performs no scraping, credential access, mutation, or retry.

## Verification

Package tests use injected fetch fixtures for definition shape, strict schemas and headers, filtering, complete multi-page collection, Link escape and loop rejection, bounds, failure atomicity, rate-limit behavior, cancellation, ETag eligibility, and 304 behavior. An isolated CLI end-to-end test loads the external package, invokes core sync with mocked provider fetch, and verifies local CLI search pagination and get. Package dependency, module architecture, TypeScript, documentation loading, compiled host, and strict OpenSpec gates protect the integration boundaries.
