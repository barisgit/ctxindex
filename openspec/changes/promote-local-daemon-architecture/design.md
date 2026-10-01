## Context

The prototype has passed its expanded automated gates and a private live acceptance journey. The Human checkpoint chose `promote`. Today the accepted daemon routes Realm and Source management, sync/status, search, exact get, and local thread traversal. Other stateful command families still compose the runtime directly and are fenced with `prototype_unsupported` while the daemon owns SQLite. The daemon is foreground-only, private/local, Bun-based, and currently relies on Darwin retained file-lock flags.

Promotion must preserve the CLI as the sole agent integration surface, the pure contract-first RPC boundary, daemon-owned application orchestration, provider-neutral core behavior, strict safe values, real cancellation, and one immutable Extension registry. It must not disguise incomplete command or operating-system coverage as a finished service.

## Goals / Non-Goals

**Goals:**

- Make one daemon-owned runtime the normal architecture for every command that reads or mutates SQLite or the active Extension registry.
- Replace prototype-only fencing with semantic procedures or narrowly proven bootstrap/filesystem-only exceptions.
- Preserve public CLI behavior and safe bounded failure semantics.
- Resolve launch-directory-dependent Extension paths before a long-lived process loads them.
- Establish explicit platform and operational readiness gates before daemon mode becomes the default.
- Promote only the implementation doctrine proven by the prototype.

**Non-Goals:**

- Public or remote RPC, TCP transport, batching, OpenAPI, an external SDK, MCP, Node runtime support, a job queue, background schedules, or hot Extension reload.
- Provider behavior, permission, schema, or storage-model changes.
- Shipping service-manager installation, autostart, backup automation, or additional local-client authentication in this change. Those require separate operational contracts after the canonical local boundary exists.

## Decisions

### 1. Promotion is command-parity first, default ownership second

The existing foreground daemon and explicit selection remain available while migration proceeds. Daemon ownership becomes the normal path only after every stateful command is either represented by a semantic procedure or classified as a safe exception, compiled coverage proves the complete inventory, and supported-platform gates pass. This avoids turning a successful architecture proof into a partially unusable default.

A generic `runCommand(argv)` tunnel is rejected. It would duplicate CLI parsing inside the daemon, erase procedure-level typing, and move formatting or exit policy across the boundary.

### 2. The accepted package boundaries become canonical doctrine

The pure `@orpc/contract` contract, recursively inferred application interface, single failure registry, thin router implementation, daemon application composition, and shared lifecycle infrastructure are promoted as stable internal ownership seams. The private RPC protocol remains unreleased and exact-versioned; only CLI behavior and exits are public.

Batching and OpenAPI generation remain deferred because a local Unix-socket protocol does not yet justify their public compatibility and security costs.

### 3. Stateful families migrate by semantic application service

OAuth App, Account, secret-backend, Artifact, export, Action, purge, and installed-Extension operations receive bounded semantic procedures. Business rules stay in existing or extracted core application services. Interactive OAuth is a staged application flow: the daemon owns provider-neutral authorization state, the loopback callback listener, provider exchange, and persistence, while the CLI owns explicit operator consent, browser launch, and the hidden manual authorization response.

`oauth-app add --from-env` retains its invocation semantics: the CLI reads the exact Provider-declared bounded mapping from its invocation environment and sends it only as the dedicated write-only sensitive input over the existing owner-private local socket. The router validates and delegates it once; middleware, diagnostics, traces, results, and errors never retain or reflect it. The daemon consumes it directly into the configured secret backend and holds no retryable or persistent staging copy. This narrow ingress wins over a second secret-transfer protocol or asking the long-lived daemon to inherit command-specific environment state.

Artifact downloads and exports use a separately bounded local byte-transfer adapter rather than embedding arbitrary bytes or host paths in JSON procedures. Its exact ticketing and cleanup contract is completed before those commands migrate.

The selected local transfer adapter retains at most 64 MiB per payload in daemon memory, returns only a cryptographically opaque 256-bit one-use ticket plus exact size and expiry metadata through RPC, and serves the bytes from an exact path on the existing owner-private Unix socket. Tickets expire after 30 seconds, consumption atomically removes them, and daemon shutdown clears all pending entries. CLI file consumers stage mode-`0600` bytes beside the destination and hard-link without overwrite before cleanup; stdout consumers validate the exact declared byte count before writing.

### 4. Bootstrap and filesystem-only exceptions are explicit

Pre-daemon `init` may remain a direct bootstrap because no initialized runtime exists yet. Catalog acquisition and inspection may remain direct only where they neither open SQLite nor mutate the active installed registry. Any operation that needs database-backed OAuth App collision checks, changes installed activation, or changes state observed by the active registry must coordinate through the daemon or require a verified stopped state.

Exceptions are an allowlist enforced by architecture tests, not a fallback. Once a compatible daemon is selected, losing it never triggers a direct SQLite open.

### 5. Relative Extension paths become canonical at persistence boundaries

Any persisted Extension path is resolved against the explicit configuration origin and stored or projected in a launch-directory-independent form. Daemon startup must produce the same Extension registry regardless of its current working directory. Existing pre-alpha configuration may be rewritten in place after validation; no compatibility migration is promised before release.

### 6. Platform support is a release gate, not an assumption

The retained ownership abstraction must expose platform-specific implementations with the same safety properties: process-retained shared/exclusive ownership, owner-private permanent metadata, death release, no stale-file attribution, and fail-closed acquisition. Darwin keeps its proven backend. Linux and Windows support are decided and implemented in explicit task checkpoints before each platform is advertised. Until a backend passes its compiled multi-process suite, daemon mode fails closed there and documentation must not claim support.

### 7. Operational services remain separate contracts

Foreground serve, health, and shutdown are sufficient to promote architecture ownership. User service installation/autostart, supervisor escalation, automatic backup, and any capability-token or peer-credential layer beyond owner-private local transport are distinct security and lifecycle products. This change records their required seams and follow-up issues but does not invent cross-platform service behavior inside command migration.

## Risks / Trade-offs

- [The migration creates a large contract surface] → Land command families in independently gated slices and derive application/client types from the one contract.
- [OAuth and byte transfer are more complex than ordinary unary procedures] → Specify staged authorization and a bounded local transfer adapter before routing those commands; never use an untyped command tunnel.
- [Direct bootstrap exceptions become backdoors] → Maintain one tested allowlist and prove each exception cannot open the daemon-owned database or mutate its active registry.
- [A platform backend can look portable while failing ownership semantics] → Require compiled contention, alias, crash, and reacquisition journeys per advertised platform and fail closed otherwise.
- [Persisted path rewriting can activate a different Extension] → Resolve relative to the recorded configuration origin, validate the complete candidate registry, and commit atomically.
- [A long-lived private protocol may accidentally become public] → Keep the CLI as the only documented integration surface and keep protocol versions exact without compatibility promises.

## Migration Plan

1. Record the accepted Human decision and merge the proven prototype without promoting its incomplete-command wording as finished behavior.
2. Add canonical implementation sidecars for the accepted package and application boundaries.
3. Inventory all stateful entrypoints and lock an architecture-tested exception allowlist.
4. Migrate OAuth App/Account/secrets, Actions, Artifact/export/purge, and installed-Extension coordination in bounded slices with direct-versus-daemon parity tests.
5. Canonicalize persisted Extension paths and prove current-working-directory independence.
6. Complete platform policy checkpoints and compiled retained-ownership suites for every advertised platform.
7. Remove `prototype_unsupported` and make daemon ownership normal only after the complete inventory and final private live acceptance pass.
8. Open separate operational changes for service installation/autostart, enhanced local-client authentication, and backup automation.

No domain schema migration is added. Pre-alpha configuration/path state may be rewritten atomically after validation.

## Open Questions

None block artifact creation. The exact Linux/Windows backend selection and local byte-transfer mechanism are explicit implementation checkpoints that must be resolved with focused prototypes before their dependent slices begin.

## Bounded registry-read parity slice — approved decisions

The user approved both registry-read clarifications for issue #79. Ordinary `describe` and `extension list` retain their existing state-free direct definition discovery before initialization, as a narrow explicit pre-initialization surface required by canonical `cli-surface`. Once initialized, both ensure the daemon on supported platforms and never fall back after ensure/selection. Existing documentation pre-init behavior is unchanged; no pre-init daemon lifecycle or broader direct exception is introduced.

Two contract-derived reads return the existing core registry description and loaded Extension identities plus installed inventory/provenance. Source-aware Action description keeps its existing route. CLI owns filtering, compact/detail/full presentation, formats, diagnostics, time-dependent acquisition age, and exits. The unsupported-platform conditional path and accepted Extension stop/lease/mutate/release/restart coordinator remain unchanged.

The approved output policy permits only named Extension-location business fields needed for current CLI output: `diagnostics[].path`, explicit-path `provenance[].path`, installed `requestedTarget` and `resolvedIdentity`, Catalog `repository`, and literal `sourceLocator.module` (including equivalent installed `curation.repository` and `curation.source_locator.module`). These are bounded location values, not arbitrary runtime paths. Diagnostics carry only core host-generated safe messages. Database/socket/runtime roots, secrets, credentials, backend errors, stacks and causes remain excluded. Canonical structured failure taxonomy is unchanged. No registry/function serialization or generic tunnel is permitted.

Adding `registry.describe` and `extension.list` advances the private protocol from 2 to 3. A client must reject an older running daemon during health compatibility checks instead of accepting it and later receiving an undeclared missing-procedure error. Existing exact-version mismatch behavior remains fail-closed; this slice does not automatically stop or replace an incompatible daemon. `tests/tooling/cli/registry-protocol.test.ts` exercises the old protocol over a real private Unix socket and checks that client and daemon production identities match.

## Bounded retained-lock spike result (task 5.2)

Linux is viable with the existing backend contract. The Linux `FileLeaseBackend` opens the permanent canonical lease file with `O_RDWR | O_NOFOLLOW` (creating it exclusively as `0600` when absent), validates it as a current-user, non-hardlinked, owner-private regular file under a current-user parent that is not group/other-writable, and checks that the pathname still names the opened inode before and after locking. It then takes a non-blocking `flock(2)` lock on that retained open file description by running a trusted system `flock(1)` (absolute, root-owned, not group/other-writable: `/usr/bin/flock`, `/bin/flock`, or `/run/current-system/sw/bin/flock`) with `-n -E 73 -x|-s 3` and the descriptor inherited as fd 3. Bun 1.3.14 exposes no `flock` binding through `node:fs`; a `flock(2)` lock belongs to the open file description, so it survives the helper's exit and is released only by `FileLease.release()` closing the retained descriptor or by process death. Exit 73 maps to the holder-neutral conflict; a missing or untrusted helper, a spawn failure, or any other exit fails closed before SQLite open. Darwin keeps `O_SHLOCK`/`O_EXLOCK | O_NONBLOCK` unchanged.

Evidence on Linux: the platform-parametric native matrix in `packages/local-daemon/src/lease.test.ts` (shared/exclusive contention, canonical aliases, permanent private files, symlink/hardlink/mode/parent/inode-replacement rejection, wrong owner through the injected uid, holder-neutral conflicts, release on close and SIGKILL, immediate reacquisition, no unlink, lifecycle/database separation); `apps/daemon/src/runtime-lease.test.ts` (fail closed before SQLite open; ownership retained from before open until after close); and the packaged multi-process suite `apps/daemon/src/e2e/compiled-lease.e2e.test.ts`. The group/other-writable parent rejection is umask-sensitive: product roots are created `0700`, so tests create private roots explicitly.

Windows was not evaluated in this slice and is not advertised: backend selection throws `FileLeaseUnsupportedError('platform')`, daemon startup fails before SQLite open, and the direct CLI remains. Executing the same suites on Darwin (`scripts/verify/darwin-daemon-gates.sh`) and the Human supported-platform checkpoint remain open.
