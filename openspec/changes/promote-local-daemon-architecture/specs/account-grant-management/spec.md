## ADDED Requirements

### Requirement: Account and Grant lifecycle is daemon-owned
Account authorization, reauthorization, inventory, rename, and removal MUST execute through daemon-owned provider-neutral application services. The CLI MAY own explicit browser launch and loopback interaction, but the daemon MUST own authorization state, provider exchange orchestration, Grant persistence, and serialized lifecycle mutation. Tokens, App snapshots, secret refs, and raw provider responses MUST NOT cross public RPC DTOs.

#### Scenario: Operator authorizes an Account
- **WHEN** an operator explicitly approves browser authorization
- **THEN** the CLI performs only the declared local interaction stages while the daemon commits the verified Account and Grant atomically
