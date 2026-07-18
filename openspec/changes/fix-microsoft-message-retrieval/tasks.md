## 1. Restore complete Microsoft mailbox retrieval

- [x] 1.1 Add a failing Microsoft mailbox retrieval regression with a wholly synthetic immutable id matching the observed length/encoding bucket and a provider replay that accepts exact message retrieval but rejects attachment metadata selection of `@odata.type`.
- [x] 1.2 Make the smallest attachment request change that passes the replay while preserving immutable-id preference, bounded validated pagination, safe file descriptors, and deferred emission.
- [x] 1.3 Pass `bun test packages/adapters/src/microsoft/mailbox/retrieve.test.ts` before continuing.
- [x] 1.4 Add a live-reproduced regression for Exchange's approximate attachment size, omit it from exact Artifact metadata, and prove the managed download stores the raw bytes.

## 2. Surface sanitized Graph diagnostics

- [x] 2.1 Add failing shared transport tests for structured Graph code parsing, recognized fixed technical wording, request-identifier redaction, unknown/malformed body withholding, and unchanged status/retry classification.
- [x] 2.2 Implement bounded diagnostic parsing at the shared Microsoft transport boundary and update JSON, calendar, and attachment-download failure paths without changing normalized error codes.
- [x] 2.3 Pass the focused Microsoft transport, calendar response, and mailbox download tests before continuing.

## 3. Replay the provider-neutral Outlook workflow

- [x] 3.1 Make the synthetic Graph server reject annotation selection, model the synthetic opaque-id encoding shape, serve paged attachment metadata, and record only safe request structure.
- [x] 3.2 Extend the compiled Outlook workflow to prove remote search Ref stability, exact get, complete paged `artifact list`, exact-byte download, and second-download cache reuse.
- [x] 3.3 Pass `bun test --path-ignore-patterns '__none__' apps/cli/src/e2e/outlook-mailbox-workflow.e2e.test.ts` and `bun test packages/adapters/src/microsoft/mailbox` before continuing.

## 4. Doctrine and automated verification

- [x] 4.1 Promote the shared Graph diagnostic boundary, complete attachment-page accumulation, and replay verification doctrine into `openspec/specs/microsoft-graph-adapters/implementation.md`.
- [x] 4.2 Refresh affected `codemap.md` files with the `cartography` skill where repository hashes changed.
- [x] 4.3 Pass `bash scripts/verify/network-egress.sh`, `bun run ci`, and `bunx openspec validate --all --strict`.
- [x] 4.4 Run the `openspec-verify-change` workflow and resolve every implementation/artifact mismatch.

## 5. Human live-provider checkpoint

- [x] 5.1 Ask for explicit approval, then run one bounded post-fix remote search, exact `get`, and `artifact list` through the existing configured Source; retain only redacted pass/fail evidence under `.operator-artifacts/`.
- [x] 5.2 If separately approved, download one known benign attachment once and verify cache reuse without exposing bytes or provider metadata.
