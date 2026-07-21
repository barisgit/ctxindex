## 1. Provider-neutral sync progress

- [x] 1.1 Add failing core tests for Source lifecycle order, cumulative emission counts, awaited backpressure, warning/failure sequencing, cancellation, and observer-omission parity.
- [x] 1.2 Implement the core sync observer and count-only coordinator/source progress path; pass focused sync coordinator, Source sync, and application-service tests.

## 2. Typed private RPC stream

- [x] 2.1 Add failing RPC tests for contract-derived iterator yield/return types, ordered validation, terminal declared errors, early iterator return, and native cancellation signal propagation.
- [x] 2.2 Implement the oRPC event-iterator contract and generic contract-derived router adaptation without a second application signature or error registry; pass focused RPC and architecture tests.

## 3. Daemon stream application and transport

- [x] 3.1 Add failing daemon tests for bounded event projection, one-item backpressure, active-request lifetime, cancellation/disconnect/shutdown cleanup, terminal result/failure, and unsafe canary exclusion.
- [x] 3.2 Implement request-scoped sync iteration and the observer-to-iterator rendezvous; pass application, runtime, transport, and compiled Unix-socket daemon tests.

## 4. CLI consumption and rendering

- [x] 4.1 Add failing daemon-client and sync-command tests for live arrival order, exactly one final JSON document, preserved Source terminal shapes, summary/compact terminal output, stable exits, cancellation, and selected-daemon no-fallback.
- [x] 4.2 Implement manual iterator consumption and CLI event rendering for both daemon and direct sync; pass focused CLI, compiled package, and local-directory sync journeys.

## 5. Doctrine and final verification

- [x] 5.1 Promote doctrine into canonical daemon-operation-streams, sync-operations, and cli-surface implementation sidecars; refresh affected codemaps and SYSTEM.md.
- [x] 5.2 Run focused gates, `bun run ci`, `bunx openspec validate --all --strict`, `git diff --check`, OpenSpec verification, and independent review; address every critical or important finding.
