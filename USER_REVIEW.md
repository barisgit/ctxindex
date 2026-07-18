# User review queue

Local coordination note for the current integration run. Do not commit this file as product documentation.

## Review first: product and trust decisions

### 1. PR #24 - Trusted Git extension catalogs

https://github.com/barisgit/ctxindex/pull/24

Why your review matters: this defines the marketplace supply-chain boundary and is the largest product step before daemon work.

Please review these decisions:

- Catalog acquisition is explicit, credential-free public HTTPS Git or absolute local Git only.
- Catalog trust and exact Extension execution trust are separate approvals.
- Installs are commit-pinned, immutable snapshots; refresh is explicit rather than ambient.
- Startup remains offline and deterministic after installation.
- Removal guards and retained snapshots match the recovery model you want.

Current status: wait for repair before approving. The branch needs a rebase and has three substantive findings: concurrent snapshot rename handling, incomplete private IPv6 rejection, and validation against an empty registry.

### 2. PR #22 - Provider-native threaded reply Drafts

https://github.com/barisgit/ctxindex/pull/22

Why your review matters: this is provider mutation behavior, even though it stops at reversible Drafts.

Please review these decisions:

- Reply context must resolve from a complete same-Source parent before provider I/O.
- Recipients, subject, and threading headers are derived deterministically rather than caller-overridden.
- Reply context is immutable after Draft creation.
- Gmail and Microsoft use provider-native reply semantics with no send route and no automatic mutation retry.
- Draft update replacement semantics are intuitive for agents.

Current status: review after #24 is repaired and merged, then the branch is rebased onto that marketplace/provider baseline.

### 3. PR #31 - Artifact descriptor and cache contract

https://github.com/barisgit/ctxindex/pull/31

Why your review matters: this is a normative domain-model decision.

Please confirm:

- An Artifact is a Source-scoped, Profile-derived descriptor associated with one Resource.
- Provider bytes are cached lazily and are not the Artifact's identity.
- Purging cached bytes preserves Resource and descriptor identity.
- Streamed exports and optional raw provider payload retention remain outside the Artifact cache.

Current status: wait for the remaining canonical generic-storage review fix and rebase.

### 4. PR #32 - External identity and natural-key Relations

https://github.com/barisgit/ctxindex/pull/32

Why your review matters: this selects the identity model used across Sources.

Please confirm:

- There is no separate `external_refs` table or global uniqueness tuple.
- Resource identity remains Source-scoped.
- Normalized RFC Message-ID is an ordinary typed Profile field used as a natural key.
- Cross-Source traversal resolves zero-to-many Relations without collapsing Resources.
- Canonical identity and duplicate collapse remain explicitly deferred.

Current status: branch is currently conflicting and must be rebased before approval.

### 5. PR #38 - Bundled V1 Profile vocabulary

https://github.com/barisgit/ctxindex/pull/38

Why your review matters: this fixes the canonical vocabulary boundary for V1.

Please confirm that V1 bundles exactly:

- `communication.message@1`
- `calendar.event@1`
- `file@1`

It removes current-bundle promises for unimplemented conversation, task, and artifact Profiles and for MBOX/ICS exports, while preserving future extension-defined Profiles.

Current status: one broken relative documentation link must be repaired before approval.

## Review second: safety and persistent semantics

### 6. PR #20 - Sync warning/error accounting

https://github.com/barisgit/ctxindex/pull/20

Please confirm that warning-only syncs remain visibly degraded but are not represented as failed: `errorsCount` counts only errors, warning state stays machine-readable, and persisted warning fields are bounded while immediate runtime diagnostics remain complete.

Current status: review after the #12 concurrency merge conflicts are resolved and the branch is republished.

### 7. PR #11 - Worktree CLI isolation

https://github.com/barisgit/ctxindex/pull/11

Please confirm the safety boundary: both root and `apps/cli` development invocations must force helper-created worktrees into worktree-local config/data/state/cache paths, even with conflicting ambient variables. Existing typed-branch attach behavior stays supported.

Current status: the P1 package-local bypass is fixed and acknowledged; final rebase and verification are running.

### 8. PR #46 - Microsoft retrieval and attachment hydration

https://github.com/barisgit/ctxindex/pull/46

This primarily needs outcome review rather than design review: stable search Ref, exact get, complete paged descriptors, exact-byte download, then cache hit. No private provider data is in the PR.

Current status: full CI and OpenSpec verification passed, but a new medium review finding about cancelling/draining oversized Graph responses must be resolved before merge.

## No user review planned unless you want it

These are implementation restorations, test harnesses, or narrow CLI affordances with no new product decision:

- PR #26 - cross-provider mailbox retrieval replay
- PR #34 - Profile codemap parity
- PR #41 - Realm display name CLI plumbing
- PR #42 - include-deleted search restoration
- Issue #43 - strict malformed sync arguments
- Issue #44 - Source creation `--no-sync`
- Issue #45 - inert Gmail options removed directly on `main` and closed
- PR #16 - final generated system-reference refresh; inspect as an integrated consistency check, not a design proposal

## Suggested review order

1. #24 marketplace
2. #22 threaded replies
3. #31, #32, and #38 core vocabulary/model set
4. #20 warning/error semantics
5. #11 isolation safety
6. #46 live Microsoft outcome

