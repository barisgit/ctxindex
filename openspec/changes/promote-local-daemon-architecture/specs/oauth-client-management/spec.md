## ADDED Requirements

### Requirement: OAuth App management is daemon-owned
OAuth App inventory, validation, addition, and removal MUST execute through daemon-owned application services when the initialized runtime is active. Inventory, results, diagnostics, errors, middleware, and logs MUST expose only safe App identity and provenance and MUST NOT carry secret values, environment contents, or backend errors.

The CLI MAY send the exact Provider-declared bounded configuration as one dedicated write-only sensitive RPC input over the owner-private local transport. That input MUST be validated before secret persistence, delegated exactly once, consumed directly into the configured secret backend, and never reflected, logged, traced, cached, retried, or retained as staging state.

#### Scenario: Local OAuth App is added from environment
- **WHEN** an operator invokes the CLI environment-import flow
- **THEN** the CLI reads only the Provider-declared mapping and sends it through the dedicated sensitive input without placing values in results, diagnostics, errors, middleware, traces, or logs
- **THEN** the daemon consumes the validated input once into the configured secret backend and retains no staging copy
