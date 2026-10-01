## 1. Shared provider replay slice

- [x] 1.1 Add a failing CLI end-to-end test that defines the shared six-phase replay contract for both calendar providers and proves each phase uses a fresh CLI process with retained isolated state.
- [x] 1.2 Add checked-in invented Google and Microsoft calendar snapshots plus the minimal test-only shared runner/provider drivers needed to satisfy the replay contract.
- [x] 1.3 Verify exact counters, opaque cursor transitions, stable Refs, normalized visible snapshots, one tombstone, stable invalidation warnings, bounded recovery routes, and unchanged post-recovery state.
- [x] 1.4 Slice gate: run `bun test --path-ignore-patterns '__none__' apps/cli/src/e2e/provider-sync-replay.e2e.test.ts` and `bun run test:e2e`.

## 2. Doctrine and final verification

- [x] 2.1 Confirm that no durable implementation doctrine applies and therefore no canonical capability implementation sidecar change is required.
- [x] 2.2 Run `bun run ci`, `bunx openspec validate --all --strict`, and OpenSpec verification for `provider-sync-replay-endurance`.
