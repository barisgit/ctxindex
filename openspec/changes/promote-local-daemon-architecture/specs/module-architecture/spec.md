## ADDED Requirements

### Requirement: Promoted daemon boundaries remain contract-derived
The private RPC contract MUST remain the single source for procedure paths, bounded inputs, plain outputs, and declared errors. The injected daemon application shape MUST derive recursively from that contract, and one failure registry MUST derive failure schemas, codes, public messages, router construction, and client validation. RPC handlers MUST delegate exactly once and MUST contain no business logic, runtime composition, storage access, provider access, CLI formatting, or exit mapping.

#### Scenario: Stateful procedure is added
- **WHEN** a remaining command family gains a daemon procedure
- **THEN** its application and client types derive from the contract without a parallel handwritten interface
- **THEN** its handler performs only compatibility, validation, exactly-once delegation, and safe result adaptation
