# GitHub Issues Adapter

`github.issues` is an indexed, sync-only Adapter for one public repository configured by `owner` and `repository`.

It requests all issue states in pages of 100, excludes pull requests returned by GitHub's issues endpoint, and validates every page and next link before committing the complete snapshot. Synchronization is bounded to 100 pages and 10,000 issues. A failure or rate limit is not retried and cannot commit a partial checkpoint or reconcile missing issues.

A first-page ETag is reused only when the preceding complete snapshot fit on one page. Multi-page repositories are fully paginated on every sync because one page's ETag is not treated as a collection-wide validator.
