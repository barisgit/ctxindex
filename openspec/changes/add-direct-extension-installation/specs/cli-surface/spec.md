## ADDED Requirements

### Requirement: Deterministic direct Extension lifecycle commands
The CLI SHALL provide these direct-install forms alongside existing loaded-Extension and Catalog commands:

```text
extensions install <npm|git|local> <target> --extension <id> [--json]
extensions update <id> [--json]
extensions list [--json]
extensions uninstall <id> [--force] [--json]
```

The source-kind positional MUST be exact and MUST prevent target-kind guessing. `--extension <id>` MUST be required for direct install even when the package exports one root. Update and uninstall MUST resolve one exact stable direct-installed Extension id. Changing target or source kind MUST require uninstall followed by a new install; update uses the persisted requested target. Existing Catalog install/uninstall selectors remain distinct and MUST NOT be reinterpreted as direct targets.

Install and update MUST be non-interactive explicit trust grants for arbitrary in-process package code. They MUST NOT prompt or require a redundant trust flag. Help MUST explain the trust boundary, and each install or update MUST emit the trust notice to stderr before acquisition or import so JSON stdout remains one valid result document. List, startup, and uninstall MUST NOT grant trust or acquire packages. All commands MUST delegate acquisition, persistence, validation, dependency checks, and removal guards to provider-neutral core.

Text and JSON output MUST be deterministic. Direct inventory and successful mutation output MUST include stable Extension id, source kind, sanitized requested target, exact resolved identity, materialization digest, and installation/update time, and MUST NOT include credentials, package-manager authentication, or absolute managed paths. Failure output MUST identify the failed lifecycle stage without leaking target credentials.

#### Scenario: Direct npm install is selected exactly
- **WHEN** an agent runs `extensions install npm @example/mail@^2 --extension example.mail --json`
- **THEN** the CLI grants execution trust, delegates one npm candidate for exact `example.mail`, and emits deterministic resolved provenance on success

#### Scenario: Source kind is omitted or guessed
- **WHEN** install supplies a target without one exact `npm`, `git`, or `local` source kind
- **THEN** parsing exits `2` before package-manager, filesystem, import, or persistence effects

#### Scenario: Exact Extension selection is omitted
- **WHEN** direct install omits `--extension <id>`
- **THEN** parsing exits `2` before acquisition or code execution even if the target exports only one root

#### Scenario: Update is explicit and offline startup remains unchanged
- **WHEN** a mutable upstream target changes
- **THEN** only `extensions update <id>` may resolve it, while `extensions list` and startup continue using the prior pin without acquisition

### Requirement: Guarded direct uninstall command
`extensions uninstall <id>` MUST fail before mutation when dependent Sources would lose their Adapter and MUST list those Sources deterministically. `--force` MUST be the only CLI acknowledgement that allows removal in that state. Forced output MUST state that Sources and materialized data were preserved and that affected Sources are unavailable. The command MUST NOT offer or perform implicit Source deletion.

#### Scenario: Normal uninstall is blocked
- **WHEN** a direct-installed Extension has dependent configured Sources and uninstall omits `--force`
- **THEN** CLI exits `2`, lists the blocking Sources, and changes no installation or Source state

#### Scenario: Force preserves data
- **WHEN** the operator repeats the exact uninstall with `--force`
- **THEN** CLI removes only the direct installation lifecycle state, reports affected Sources unavailable, and does not delete their data

### Requirement: Direct lifecycle remains agent-safe and relocatable
Every direct lifecycle command MUST be non-interactive and MUST support deterministic JSON where declared. A relocated compiled CLI MUST install from local npm, Git, and local-package fixtures, restart offline from immutable managed materializations, update only on explicit request, and exercise guarded plus forced uninstall without project-tree imports.

#### Scenario: Relocated compiled CLI restarts offline
- **WHEN** the compiled direct-install end-to-end test relocates the executable and ctxindex state after installing a fixture
- **THEN** Extension listing and loading succeed from the pin with package-manager and network access disabled
