## Context

External Extensions currently load only from configured local paths. Issue #23 promotes trusted Git-backed distribution before daemon work, but startup and ordinary use must remain offline and Extension code still executes in-process with full trust. The design must make repository acquisition reproducible, keep provider authority solely in loaded Adapter declarations, work from a relocated compiled CLI, and preserve existing Sources and Resources when installed code disappears.

## Goals / Non-Goals

**Goals:**
- Register multiple explicitly trusted public HTTPS or absolute local Git repositories and resolve a full ref or exact object ID to one commit.
- Materialize immutable local snapshots during add, explicit refresh, and default command-time refresh for Catalog discovery/install; keep `--no-refresh`, startup loading, loaded-Extension listing, and uninstall offline.
- Validate a small strict manifest, bounded paths/files, repository containment, and exact Extension identity before activation.
- Persist portable Catalog and installed provenance without absolute snapshot paths, and make refresh independent from explicit install replacement.
- Disable ambient Git credential, prompt, hook, filter, submodule, and external-protocol behavior.

**Non-Goals:**
- SSH, credentials, private repositories, cross-repository entries, nested Catalogs, ambient/startup refresh, polling, daemon integration, package managers, dependency resolution, build hooks, Git LFS, submodules, or external protocol helpers.
- Hosted marketplace features, publication workflows, signatures, transparency logs, sandboxing, or out-of-process execution.
- Catalog-owned authentication, scopes, hosts, Adapter configuration, automatic Source creation, or provider authorization.

## Decisions

1. **A Catalog pin and an installed provenance record are separate immutable facts.** Refresh replaces only the Catalog's resolved commit after the candidate snapshot and manifest validate. Install copies the exact Catalog ID, repository identity, commit, manifest entry identity, and source path into installed provenance. This prevents refresh from silently changing executable code and makes identical installation idempotent.

2. **Snapshots are derived storage, records are portable configuration.** Strict TOML documents under ctxindex configuration own Catalog and installed records. Snapshot locations are derived as `data/catalogs/<local-name>/<commit>` and absolute snapshot paths are never persisted. This keeps relocations deterministic and allows missing snapshots to degrade through loader diagnostics.

3. **Acquisition is command-bound, never ambient.** Add, explicit refresh, and default refresh inside Catalog discovery/install commands use system Git in a temporary candidate directory with terminal prompts, credential helpers, hooks, filters, submodule recursion, and external protocols disabled. `--no-refresh` selects the stored snapshot. Startup, loaded-Extension listing, and uninstall never acquire. A default refresh failure fails the requesting command instead of silently serving stale discovery. The candidate commit tree is archived into a newly created immutable snapshot directory; no checkout executes repository configuration or hooks.

4. **Remote repository policy is syntactic and credential-free.** Only HTTPS URLs without userinfo, query, or fragment components are accepted. Localhost names, including root-dot spellings, and literal loopback, private, link-local, unspecified, and multicast IP destinations are rejected before Git. DNS resolution is not used as an authorization mechanism; redirects and network policy remain Git/host concerns. Absolute local repositories are accepted, while relative local paths and non-committed working-tree content are rejected.

5. **The manifest is deliberately closed.** `ctxindex-catalog.json` schema version 1 contains only Catalog identity/metadata plus inline Extension entries and optional prose setup paths. Strict unknown-field rejection forbids Catalog-declared auth, scopes, configuration, hosts, installers, or other provider authority. Every entry is validated before a Catalog pin changes.

6. **Replacement is validate-then-switch.** Install loads and validates the requested Extension from the pinned snapshot and verifies its definition identity before atomically rewriting installed provenance. A different provenance for the same Extension identity replaces the old record only after validation succeeds. Snapshots are retained because uninstall/removal are metadata operations and Sources or Resources may still refer to older definitions.

7. **Catalog behavior lives in provider-neutral core.** CLI code performs parsing, output formatting, and service delegation only. The existing Extension loader consumes installed provenance and the normal registry validation seam, allowing missing or invalid snapshots to produce diagnostics without any fetch.

8. **Snapshot age is portable provenance.** Catalog and installed records store the acquisition time of their exact commit snapshot. Read and install output derives an age from that timestamp, and loaded Catalog provenance carries it through the offline loader. This avoids filesystem-mtime dependence after relocation.

## Risks / Trade-offs

- [In-process Extension execution remains fully trusted] → Require separate exact-install `--trust`, validate identity first, and state provenance in listings.
- [System Git versions differ] → Use conservative commands/configuration and local fixtures; keep acquisition errors deterministic at the service boundary.
- [Snapshot retention can consume disk] → Retain snapshots for safety and provenance in this scope; automatic cleanup is intentionally deferred.
- [Syntactic host rejection cannot detect DNS rebinding to a private address] → Credential-free HTTPS plus disabled prompts/helpers narrows exposure; stronger network policy is outside this initial local Git Catalog scope.
- [Concurrent mutations could race] → Write records through same-directory temporary files and atomic rename; candidate snapshots publish by rename only after validation.

## Migration Plan

No migration is required. The repository is pre-alpha and the new strict Catalog/installed TOML files are absent by default. Existing explicit-path Extension configuration continues unchanged. Invalid new records fail closed; missing snapshot data yields diagnostics without modifying stored state.

## Open Questions

None.
