# Cli Surface Specification

## Purpose
Define deterministic non-interactive CLI behavior, entity labels and resolution, machine-readable output, and bundled agent skills.

## Requirements

### Requirement: CLI commands, labels, and non-interactive output
The reference CLI MUST provide a deterministic non-interactive OAuth App and Account lifecycle and SHOULD provide commands for initialization, Realm/Source configuration, sync, search, retrieval, typed Actions, status, and maintenance. The specific command set offered by a release is captured in that release's milestone document.

OAuth lifecycle commands MUST include exactly these public forms:

```text
oauth-app add <provider> <label> --from-env
oauth-app list [--json]
oauth-app remove <provider> <label>
account add <provider> --app <label> [--label <label>]
account list [--json]
account remove <label>
```

The CLI MUST NOT expose a `client` command, alias, flag, inventory entity, or compatibility route. OAuth App labels MUST resolve only within their explicit Provider. `oauth-app add` and `account add --app` MUST require an exact App label and MUST NOT default, normalize, prompt for, automatically suffix, or guess it even when the Provider has exactly one available App. Account and Source labels MUST remain globally unique bare handles. An omitted Account label MUST default verbatim to the verified Provider identity; an omitted Source label MUST default verbatim to `<account-label>-<adapter-tail>` or `<adapter-tail>` when no Account is required.

`oauth-app add --from-env` MUST use only the active Provider registration's typed top-level config-key-to-environment-variable-name mapping and the central environment loader. It MUST accept no literal config, client id, client secret, token, authorization code, generic JSON config, or secret value as argv. The assembled config MUST pass the Provider's complete config schema before any secret-store write or database mutation. Unknown Provider selection MUST fail before environment/secret reads, database mutation, browser launch, or Provider egress. Missing or invalid config MUST fail before secret-store writes, database mutation, browser launch, or Provider egress.

`oauth-app list` MUST be deterministic and MUST project only Provider id, App label, origin, and safe provenance. Human and JSON output MUST NOT include App config, environment names or values, client ids, desktop-secret metadata, typed secret references, tokens, Grant state, or secret values. `oauth-app remove` MUST resolve exact `(providerId,label)` and MUST affect only future authorization; existing Grants continue from their snapshots.

`account add` MUST require `--app <label>`, resolve exact `(providerId,label)`, and fail before secret/database/browser/network effects when the Provider or App is unknown. Authorization MUST use the selected active or persisted local App config and snapshot it into the private Grant. Authorization and refresh MUST NOT reread App config from environment variables.

CLI output SHOULD be compact human-readable text by default, with verbose output and JSON opt-in. Every read command SHOULD support JSON. User-facing configuration SHOULD be reachable through CLI commands, while direct TOML MAY remain a power-user path.

The CLI MUST NOT use interactive TTY prompts for required input. Required input MUST come from non-secret flags, Provider-declared environment names, typed secret references, or explicitly declared stdin. Missing input MUST fail clearly with a non-zero stable exit. The only permitted interactive surface is the browser during explicitly requested OAuth authorization. Long-lived tokens, App configuration secrets, and authorization codes MUST NOT be literal process arguments.

Unknown Realm, OAuth App, Account, Source, or Adapter references MUST fail fast with an actionable error and MUST NOT auto-create state unless an explicit create command is running. Source-referencing commands MUST accept exact Source labels wherever they accept Source ids.

#### Scenario: Local OAuth App is imported without literal secrets
- **WHEN** `oauth-app add google work --from-env` receives a complete valid Provider-mapped environment config
- **THEN** it persists local App `(google,work)` through typed secret references without config appearing in argv or output

#### Scenario: Account App selection never guesses
- **WHEN** `account add google` omits `--app` or supplies an unknown App label
- **THEN** it exits `2` before secret/database/browser/network effects and reports the required exact selection

#### Scenario: Client compatibility command is absent
- **WHEN** a caller invokes `client`, `client add`, or a Client-selection alias
- **THEN** parsing rejects it as invalid usage and creates no state

#### Scenario: OAuth App JSON inventory is safe
- **WHEN** an agent runs `oauth-app list --json`
- **THEN** every row contains only Provider id, label, origin, and safe provenance

### Requirement: Bundled skills surface
ctxindex MUST keep bundled skill guidance consistent with the public CLI and SHOULD ship that documentation alongside the binary so agents can discover usage without external docs. The skills surface SHOULD provide at least:

- a list command that prints bundled skill names and summaries;
- a get command that prints one skill's content, with an option to inline all referenced docs;
- a path command that prints where bundled skills live.

Bundled skill docs MUST be versioned with the ctxindex release that ships them. Agent-facing kinds, fields, filters, formats, Actions, and Adapter flags MUST be derived from loaded definitions and schemas rather than duplicated manually. Hand-written bundled skill prose MUST remain workflow guidance. Passive Extension documentation sidecars and their transport-neutral core projection are a separate contract; the current CLI and bundled agent skills MUST NOT present that projection until a dedicated consumer contract is accepted.

Bundled workflow guidance MUST use OAuth App and Account vocabulary, the exact commands in this specification, and MUST NOT teach Client or public Grant concepts.

#### Scenario: Bundled skills use exact OAuth App workflow
- **WHEN** an agent reads bundled authorization guidance
- **THEN** it receives `oauth-app add ... --from-env` followed by `account add ... --app ...` and no Client command or Grant selector

#### Scenario: Extension documentation is not implicit skill content
- **WHEN** a loaded Extension contributes a passive documentation sidecar
- **THEN** the current bundled skills surface does not expose or inline that sidecar without a separately accepted consumer contract

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
