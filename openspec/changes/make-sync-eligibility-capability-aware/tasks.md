## 1. Core sync eligibility and selection reporting

- [x] 1.1 Add failing core `SyncApplicationService` tests for mixed eligible/disabled/unsupported/missing-Adapter selection with ordered skipped reasons, zero-eligible results, and targeted unsupported rejection before `syncSource`; implement `adapterSupportsSync`, the skipped partition, and targeted rejection.
- [x] 1.2 Run focused core sync and Source sync tests.

## 2. Capability-aware Source status

- [x] 2.1 Add failing core Source service tests for pending, disabled, unsupported, needs_auth precedence, and recorded run status; implement the effective status projection in `getStatus`.
- [x] 2.2 Run focused core Source service tests.

## 3. Daemon and CLI output parity

- [x] 3.1 Add failing RPC schema, daemon projection, and CLI sync tests for the skipped list, zero-eligible summary/compact/JSON output, and targeted unsupported exit `2` on direct and daemon routes; extend the RPC result schema, daemon projection, and CLI rendering.
- [x] 3.2 Add CLI and compiled-daemon end-to-end assertions for mixed Sources, zero-eligible sync, targeted unsupported rejection without a Sync Run, and capability-aware status JSON.
- [x] 3.3 Run focused RPC, daemon, CLI unit, and affected end-to-end tests.

## 4. Documentation, doctrine, and final verification

- [x] 4.1 Update user-facing troubleshooting/usage docs and affected codemaps without duplicating normative specs.
- [x] 4.2 Promote applicable doctrine into the canonical `sync-operations`, `realm-and-source-management`, and `cli-surface` implementation sidecars.
- [ ] 4.3 Run `bun run ci`, `bun run test:integration`, `bun run test:e2e`, `bunx openspec validate --all --strict`, and `openspec-verify-change`.
