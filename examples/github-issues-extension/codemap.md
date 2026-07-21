# examples/github-issues-extension/

## Responsibility

Provides the public, credential-free GitHub Issues demonstration Extension. The private ESM workspace package advertises `extension.ts` through `ctxindex.extensions`; its default root composes the no-auth GitHub Provider, one indexed sync Adapter, the versioned software-issue Profile, and package-sidecar documentation.

## Design

- `extension.ts` imports only public `@ctxindex/extension-sdk` authoring APIs. It exports stable `github.public`, `github.issues`, and `software.issue@1` definitions beneath the `ctxindex.github-issues-demo` Extension root.
- `githubPublicProvider` uses `auth.none()`; `githubIssuesAdapter` is Provider-bound, sync-only, indexed, restricted to `api.github.com`, and accepts strict `{ owner, repository }` source configuration.
- The adapter validates GitHub issue pages, removes pull requests returned by GitHub's shared Issues endpoint, normalizes labels and timestamps into `softwareIssueSchema`, and limits a snapshot to 100 pages or 10,000 issues.
- Pagination accepts only advancing canonical HTTPS GitHub API links with the exact expected query. A one-page completed snapshot can carry a validated ETag; multi-page snapshots deliberately do not reuse page-one validation as collection validation.
- `docs/` supplies the required index plus Provider, Adapter, versioned Profile, and manual-demo pages through `docs('./docs')`; `website-handoff.ts` provides the website-facing target, stable IDs, demo Realm/Source labels, and public/default fallback repositories.

## Flow

1. Package entry discovery imports `./extension.ts`, collects the default `ctxindex.github-issues-demo` root, and binds the `./docs` descriptor to that acquired module URL.
2. `operations.sync(context)` validates Source config and cursor, calls injected host-scoped `context.fetch` against the canonical GitHub REST collection URL, and sends `If-None-Match` only for an eligible prior one-page cursor.
3. A `304` preserves the completed cursor with a checkpoint. Otherwise, validated pages are collected, deduplicated, filtered, and ordered by issue number; unsafe links, malformed responses, rate-limit/error responses, cancellation, and configured bounds abort before a new checkpoint.
4. A completed snapshot emits `upsertResource` values with Source-scoped issue refs, emits removals for previously checkpointed absent issue numbers, then writes a versioned checkpoint with the ordered issue numbers, page count, and eligible ETag.
5. The website/demo guide installs the local package into Realm `demo`, creates `ctxindex-issues`, and syncs a chosen public repository without credentials; GitHub's unauthenticated rate limit is surfaced as a failed, non-retrying sync.

## Integration

- Runtime dependency: `@ctxindex/extension-sdk`; `@ctxindex/core` and `@ctxindex/official` are package-test dev dependencies for package discovery and built-in isolation checks.
- Network boundary: only `https://api.github.com/repos/{owner}/{repository}/issues` through operation-context fetch; no token, OAuth app, secret state, DOM scraping, or live provider contact in automated tests.
- Website handoff: `website-handoff.ts` defines the intended website/demo integration contract for the extension path, IDs, Realm/Source labels, and `barisgit/ctxindex` then `octocat/Hello-World` fallback configuration. No production consumer exists in this change set yet.
