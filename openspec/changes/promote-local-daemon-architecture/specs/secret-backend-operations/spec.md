## ADDED Requirements

### Requirement: Secret backend mutation is daemon-owned
Secret-backend status and backend switching MUST execute through daemon-owned application services after initialization. Secret values and backend-native error details MUST never appear in RPC results, diagnostics, or logs, and backend switching MUST preserve its existing copy-verify-commit-cleanup semantics.

#### Scenario: Operator switches the secret backend
- **WHEN** the CLI requests a backend switch while the daemon owns the runtime
- **THEN** the daemon serializes and completes the existing safe transition without exposing any secret value to the client
