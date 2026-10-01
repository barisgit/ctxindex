## 1. Typed documentation RPC contract

- [x] 1.1 Add failing schema and router tests for strict bounded documentation list, exact-get, and search procedures, including content-free inventory/search and canonical bounded asset Base64
- [x] 1.2 Implement schema-first documentation DTOs, contract procedures, derived application routing, and client methods
- [x] 1.3 Run the focused `@ctxindex/rpc` test and typecheck gate

## 2. Daemon-owned documentation service

- [x] 2.1 Add failing application/runtime tests proving documentation uses the startup-loaded projection, obeys lifecycle admission, encodes exact content safely, and rejects oversized output
- [x] 2.2 Compose the Extension-only core documentation service from `LoadExtensionsResult.documentation` and implement the daemon application projection
- [x] 2.3 Run focused daemon application, runtime, transport, and compiled Extension tests

## 3. CLI routing and presentation

- [x] 3.1 Add failing CLI tests for direct composition, selected-daemon Extension routing, local bundled get, deterministic combined list/search, exact asset decoding, and no fallback after selected-daemon failure
- [x] 3.2 Implement one-time documentation runtime selection and asynchronous local/daemon composition without changing public output shapes
- [x] 3.3 Run focused CLI documentation, daemon-client, compiled documentation, and CLI architecture gates

## 4. Doctrine and final verification

- [x] 4.1 Promote applicable doctrine into both canonical capability implementation sidecars and refresh affected codemaps
- [x] 4.2 Run `bun run ci`, `bunx openspec validate --all --strict`, and the `openspec-verify-change` completeness/correctness/coherence review
- [x] 4.3 Obtain an independent code review, address all critical and important findings, and commit the verified change without archiving or pushing
