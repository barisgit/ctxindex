> **SUPERSEDED — DO NOT SYNC.** This completed Client-era change is retained only as historical evidence. `redesign-extension-sdk` removes the Client surface and replaces it with `oauth-app list --json`. Its delta spec MUST NOT be synced into canonical specs. Archive only with explicit user approval.

## 1. Client JSON inventory slice

- [x] 1.1 Add focused argument and CLI e2e tests for `client list --json`, exact safe metadata shape, empty `[]`, provider-then-label determinism, secret redaction, and unchanged text output; run them first to establish the current failure.
- [x] 1.2 Implement the list JSON flag, explicit safe JSON projection, handler selection, generated command metadata, and agent-facing CLI documentation.
- [x] 1.3 Run the focused Client argument/e2e tests and the CLI thin-boundary gates.

## 2. Doctrine and final verification

- [x] 2.1 Promote the explicit safe JSON projection and verification doctrine into `openspec/specs/oauth-client-management/implementation.md`.
- [x] 2.2 Run `bun run ci`, `bunx openspec validate --all --strict`, and `openspec-verify-change` for `support-client-list-json`.
