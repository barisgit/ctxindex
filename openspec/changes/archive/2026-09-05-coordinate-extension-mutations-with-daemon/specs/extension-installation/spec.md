## ADDED Requirements

### Requirement: Installed Extension mutations coordinate with daemon registry ownership
Extension install, update, and uninstall SHALL NOT mutate installed Extension state while a local daemon can load or retain the affected runtime registry. On a daemon-supported platform, the CLI MUST stop a running daemon before mutation and MUST retain direct shared database ownership for the complete mutation. After that ownership is released, it MUST restart the daemon if and only if the daemon was running before the command. The restart MUST be attempted after either mutation success or mutation failure.

Existing Extension validation, acquisition, lifecycle result, error, trust-notice, and output behavior MUST otherwise remain unchanged. On a platform where daemon ownership is unsupported, the command MUST preserve its direct behavior without requiring a daemon.

#### Scenario: Running daemon activates an installed Extension change
- **WHEN** an operator installs, updates, or uninstalls an Extension while the matching daemon is running
- **THEN** the daemon shuts down before installed state changes, no daemon owns or opens the database during the mutation, and a later daemon start loads the resulting complete registry
- **THEN** the CLI restarts that daemon after releasing direct ownership

#### Scenario: Stopped daemon remains stopped
- **WHEN** an operator mutates installed Extension state while no matching daemon is running
- **THEN** the mutation retains direct shared database ownership for its duration and the CLI does not start a daemon solely to restore prior state

#### Scenario: Failed mutation restores prior running state
- **WHEN** a daemon was running and the Extension mutation fails validation, acquisition, or durable publication
- **THEN** direct ownership is released, the daemon restart is attempted, and the original Extension failure remains authoritative

#### Scenario: Unsupported platform preserves direct lifecycle
- **WHEN** the platform cannot provide retained daemon ownership
- **THEN** the Extension mutation uses the existing direct path and does not fail merely because daemon lifecycle is unsupported
