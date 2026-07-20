## 1. Lock the promoted boundary and complete inventory

- [ ] 1.1 Add failing architecture and contract-derivation tests that reject a generic command tunnel, a second procedure/application signature list, business logic in `@ctxindex/rpc`, and any stateful CLI path absent from either the daemon procedure inventory or the explicit safe-exception allowlist.
- [ ] 1.2 Inventory every CLI entrypoint that touches SQLite, secrets, Accounts/Grants/OAuth Apps, provider runtime, managed Artifact state, installed activation, or the active registry; classify only pre-daemon initialization and proven filesystem-only Catalog operations as candidate direct exceptions.
- [ ] 1.3 Replace prototype terminology in normal lifecycle/application interfaces while retaining exact private protocol compatibility, bounded declared errors, native cancellation, and stable CLI exits; pass focused RPC, daemon, CLI, package-dependency, and module-architecture gates.

## 2. OAuth App, Account, and secret lifecycle

- [ ] 2.1 Add failing contract/application/CLI tests for OAuth App list/add/remove and secret status/backend switching, including strict safe inventory, the exact bounded write-only environment input, secret canaries absent from middleware/results/errors/traces/logs/retry or staging state, exactly-once consumption, copy-verify-commit-cleanup behavior, malformed zero-side-effect input, cancellation, and no client SQLite/runtime open.
- [ ] 2.2 Implement daemon-owned OAuth App and secret-backend application services and semantic procedures; permit secret values only in the dedicated owner-private write-only input, consume them directly without automatic retry or staging, and exclude them plus backend-native errors from every output/observability surface; pass focused core/RPC/daemon/CLI/security gates.
- [ ] 2.3 Add failing staged-authorization tests for Account add/reauthorize/list/remove, explicit browser consent, loopback state/code handling, one-use expiry, serialized Grant mutation, stable CLI output/exits, and token/App/provider-payload exclusion.
- [ ] 2.4 Implement daemon-owned Account/Grant lifecycle with CLI-owned explicit browser/loopback interaction and provider-neutral core orchestration; pass loopback-only compiled acceptance with synthetic credentials and no live provider access.

## 3. Actions, Artifacts, exports, and purge

- [ ] 3.1 Add failing Action describe/run contract/application/CLI tests for active-registry resolution, local validation, exactly-once invocation, cancellation, bounded Resource output, existing Draft-only safety, and no client runtime composition.
- [ ] 3.2 Implement Action description/invocation through daemon-owned services and pass focused provider-neutral, Adapter-mock, RPC, daemon, CLI, and architecture gates.
- [ ] 3.3 Prototype the bounded owner-private byte-transfer adapter against cancellation, maximum size, concurrent tickets, expiry, atomic destination replacement, daemon shutdown, crash cleanup, and path/secret leakage; record the selected mechanism in design/implementation and pause at a Human architecture checkpoint before adopting it.
- [ ] 3.4 Add failing Artifact list/download, export, and purge tests over the approved transfer boundary, including cache hit/miss, provider-stream failure, partial-output cleanup, safe metadata, unchanged CLI behavior, and no byte arrays or raw host paths in ordinary RPC DTOs.
- [ ] 3.5 Implement daemon-coordinated Artifact/export/purge application services and byte transfer; pass focused core/RPC/daemon/CLI, package smoke, and compiled multi-process gates.

## 4. Extension path identity and activation

- [ ] 4.1 Add failing tests that persist a relative Extension from an explicit configuration origin, start the daemon from unrelated working directories/path aliases, and require the same complete registry or the same bounded failure.
- [ ] 4.2 Implement validated atomic canonical path persistence/projection with pre-alpha rewrite behavior; pass Extension loader, relocated compiled-Extension, no-network-startup, and security gates.
- [ ] 4.3 Add failing Catalog/install/uninstall tests that distinguish filesystem-only acquisition from active-provenance changes, use the runtime-complete registry for validation, preserve prior activation on failure, and never let CLI output claim an unobserved in-process registry replacement.
- [ ] 4.4 Implement daemon-coordinated installed-Extension activation or explicit bounded restart-required behavior; pass Catalog concurrency, OAuth App collision, immutable-registry, restart, and compiled multi-process gates.

## 5. Supported-platform ownership

- [ ] 5.1 Preserve the proven Darwin retained-lease backend and extract platform selection behind the existing `FileLeaseBackend` without changing canonical identities, conflict wording, or lease lifetime.
- [ ] 5.2 Run bounded Linux and Windows retained-lock spikes covering shared/exclusive contention, aliases, private owner metadata, symlink/reparse safety, SIGKILL/process-death release, and immediate reacquisition; document viable backends and pause at a Human supported-platform checkpoint before advertising or implementing additional platforms.
- [ ] 5.3 Implement each approved platform backend and its compiled multi-process suite; make daemon startup fail closed before SQLite open where a backend is unavailable/unsafe, preserve the direct CLI until that platform is promoted, and keep public support documentation exact.

## 6. Normal ownership cutover

- [ ] 6.1 Extend the compiled daemon journey across the complete stateful-command inventory and safe-exception allowlist, proving one immutable runtime, no selected-daemon fallback, no client SQLite open, stable output/exits, cancellation, restart, shutdown timeout ownership, crash recovery, and no live provider/network dependence.
- [ ] 6.2 Remove `prototype_unsupported` from normal command behavior, make daemon ownership the normal stateful path only after every prior slice passes, and retain a deterministic explicit foreground/debug serve path.
- [ ] 6.3 Open separate issue/OpenSpec follow-ups for service installation/autostart and supervisor policy, enhanced local-client authentication, and backup automation; keep remote access, batching, OpenAPI/SDK generation, queues, and scheduling explicitly deferred.
- [ ] 6.4 Run the isolated private live workflow across setup, authorization, sync/search/get/thread, Draft Action, Artifact/export, Extension activation boundary, cancellation, shutdown/restart, and direct exceptions; pause for Human acceptance before archive.

## 7. Doctrine and final verification

- [ ] 7.1 Promote the accepted doctrine into `local-daemon/implementation.md` and the canonical `module-architecture`, `cli-surface`, `error-taxonomy`, `generic-storage`, `extension-loading`, `oauth-client-management`, `account-grant-management`, `secret-backend-operations`, `retrieval-and-artifacts`, `extension-catalogs`, and `provider-actions` implementation sidecars exactly as listed in `implementation.md`.
- [ ] 7.2 Refresh affected codemaps through cartography and the readable system projection through system-reference; double-check user/developer documentation against the exact supported platforms and command ownership.
- [ ] 7.3 Run all focused slice gates, `bun run ci`, `bunx openspec validate --all --strict`, `git diff --check`, `openspec-verify-change`, and independent security/architecture reviews; resolve every critical or important finding before archive.
