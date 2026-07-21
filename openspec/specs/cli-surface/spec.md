# Cli Surface Specification

## Purpose
Define deterministic non-interactive CLI behavior, entity labels and resolution, machine-readable output, and bundled agent skills.

## Requirements

### Requirement: CLI commands, labels, and non-interactive output
The reference CLI MUST provide a deterministic non-interactive OAuth App and Account lifecycle and SHOULD provide commands for initialization, Realm/Source configuration, sync, search, retrieval, typed Actions, status, and maintenance. The specific command set offered by a release is captured in that release's milestone document.

OAuth lifecycle commands MUST include exactly these public forms:

```text
oauth-app add <provider> <label> --from-env
oauth-app list [--format json]
oauth-app remove <provider> <label>
account add <provider> --app <label> [--label <label>]
account list [--format json]
account remove <label>
```

The CLI MUST NOT expose a `client` command, alias, flag, inventory entity, or compatibility route. OAuth App labels MUST resolve only within their explicit Provider. `oauth-app add` and `account add --app` MUST require an exact App label and MUST NOT default, normalize, prompt for, automatically suffix, or guess it even when the Provider has exactly one available App. Account and Source labels MUST remain globally unique bare handles. An omitted Account label MUST default verbatim to the verified Provider identity; an omitted Source label MUST default verbatim to `<account-label>-<adapter-tail>` or `<adapter-tail>` when no Account is required.

`oauth-app add --from-env` MUST use only the active Provider registration's typed top-level config-key-to-environment-variable-name mapping and the central environment loader. It MUST accept no literal config, client id, client secret, token, authorization code, generic JSON config, or secret value as argv. The assembled config MUST pass the Provider's complete config schema before any secret-store write or database mutation. Unknown Provider selection MUST fail before environment/secret reads, database mutation, browser launch, or Provider egress. Missing or invalid config MUST fail before secret-store writes, database mutation, browser launch, or Provider egress.

`oauth-app list` MUST be deterministic and MUST project only Provider id, App label, origin, and safe provenance. Human and JSON output MUST NOT include App config, environment names or values, client ids, desktop-secret metadata, typed secret references, tokens, Grant state, or secret values. `oauth-app remove` MUST resolve exact `(providerId,label)` and MUST affect only future authorization; existing Grants continue from their snapshots.

`account add` MUST require `--app <label>`, resolve exact `(providerId,label)`, and fail before secret/database/browser/network effects when the Provider or App is unknown. Authorization MUST use the selected active or persisted local App config and snapshot it into the private Grant. Authorization and refresh MUST NOT reread App config from environment variables.

CLI output SHOULD be compact human-readable text by default, with verbose output and JSON opt-in. Every read command SHOULD support JSON. `--format` MUST be the sole output selector, `-f` MUST be its exact short alias, and the CLI MUST NOT expose a `--json` compatibility flag. Frequent unambiguous options MUST expose `-s` for `--source`, `-r` for `--realm`, `-l` for `--limit`, and `-o` for file `--output` wherever those long options exist. Generated Adapter configuration flags and ambiguous domain selectors MUST remain long-only. User-facing configuration SHOULD be reachable through CLI commands, while direct TOML MAY remain a power-user path.

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
- **WHEN** an agent runs `oauth-app list --format json`
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
The CLI SHALL expose one singular Extension group with exact source selection for direct and Catalog-curated installation:

```text
extension install <catalog|npm|git|local> <target> <extension-id> [--no-refresh] [--format json]
extension update <extension-id> [--format json]
extension list [--format json]
extension uninstall <extension-id> [--force] [--format json]
```

The source-kind positional MUST be exact and MUST prevent target-kind guessing. For `catalog`, target SHALL be one configured Catalog name and `--no-refresh` MAY select its stored snapshot. For `npm`, `git`, or `local`, target SHALL be the requested direct package target and `--no-refresh` MUST be rejected. The stable Extension id MUST be a required positional for every install even when a package exports one root.

Install and update MUST be non-interactive explicit trust grants for arbitrary in-process package code. They MUST NOT prompt or require a redundant trust flag. Help MUST explain the execution trust boundary, and each install or update MUST emit the trust notice to stderr before refresh, acquisition, replay, or import so JSON stdout remains one valid result document. List, startup, and uninstall MUST NOT grant trust or acquire packages. All commands MUST delegate acquisition, persistence, validation, dependency checks, and removal guards to provider-neutral core.

Direct and Catalog-backed commands SHALL share the canonical installer and generic installed-extension record. Install SHALL obey existing origin collision and same-Catalog replacement rules. Update SHALL resolve one exact installed stable id and follow its persisted direct or Catalog provenance without changing origin. Changing target, source kind, Catalog identity, or stable id MUST require uninstall followed by a new install.

Text and JSON output MUST be deterministic. Inventory and successful mutation output MUST include stable Extension id, source kind, sanitized requested target, exact resolved identity, materialization digest, installation/update time, and optional Catalog curation, and MUST NOT include credentials, package-manager authentication, or absolute managed paths. Failure output MUST identify the failed lifecycle stage without leaking target credentials.

#### Scenario: Direct npm install is selected exactly
- **WHEN** an agent runs `extension install npm @example/mail@^2 example.mail --format json`
- **THEN** the CLI grants execution trust, delegates one npm candidate for exact `example.mail`, and emits deterministic resolved provenance on success

#### Scenario: Catalog install is selected exactly
- **WHEN** an agent runs `extension install catalog community example.mail --format json`
- **THEN** only configured Catalog `community` refreshes before exact replay and successful output retains Catalog curation

#### Scenario: Source kind is omitted or guessed
- **WHEN** install supplies a target without one exact `catalog`, `npm`, `git`, or `local` source kind
- **THEN** parsing exits `2` before Catalog refresh, package-manager, filesystem, import, or persistence effects

#### Scenario: Exact Extension selection is omitted
- **WHEN** install omits the stable Extension id
- **THEN** parsing exits `2` before acquisition or code execution even if the selected source exports one root

#### Scenario: Update is explicit and offline startup remains unchanged
- **WHEN** a mutable direct target or Catalog curation changes
- **THEN** only `extension update <id>` or a new exact same-Catalog install may advance it, while listing and startup continue using the prior pin without acquisition

### Requirement: Guarded direct uninstall command
`extension uninstall <id>` MUST fail before mutation when dependent Sources would lose their Adapter and MUST list those Sources deterministically. `--force` MUST be the only CLI acknowledgement that allows removal in that state. Forced output MUST state that Sources and materialized data were preserved and that affected Sources are unavailable. The command MUST NOT offer or perform implicit Source deletion.

#### Scenario: Normal uninstall is blocked
- **WHEN** an installed Extension has dependent configured Sources and uninstall omits `--force`
- **THEN** CLI exits `2`, lists the blocking Sources, and changes no installation or Source state

#### Scenario: Force preserves data
- **WHEN** the operator repeats the exact uninstall with `--force`
- **THEN** CLI removes only the installation lifecycle state, reports affected Sources unavailable, and does not delete their data

### Requirement: Direct lifecycle remains agent-safe and relocatable
Every direct lifecycle command MUST be non-interactive and MUST support deterministic JSON where declared. A relocated compiled CLI MUST install from local npm, Git, and local-package fixtures, restart offline from immutable managed materializations, update only on explicit request, and exercise guarded plus forced uninstall without project-tree imports.

#### Scenario: Relocated compiled CLI restarts offline
- **WHEN** the compiled direct-install end-to-end test relocates the executable and ctxindex state after installing a fixture
- **THEN** Extension listing and loading succeed from the pin with package-manager and network access disabled

### Requirement: Deterministic trusted Catalog authoring command

The CLI SHALL provide a non-interactive Catalog build command that accepts an
author package, optional Catalog id, and output location. It SHALL derive the
single declared ctxindex entry module from the package manifest and fail
deterministically when the package declares multiple entry modules. It SHALL show
or return a trust warning covering package acquisition, Bun execution, and
author-controlled module import, and SHALL require explicit trust before any of
those actions.

The command SHALL generate deterministic schema-v2 output through the Catalog
authoring service and canonical installer's `resolveForAuthoring` operation. It
SHALL write no partial output when any candidate fails.

#### Scenario: Generated snapshot is current

- **WHEN** a trusted build succeeds for the same exact inputs twice
- **THEN** canonical snapshot and content-addressed lock artifact bytes are
  identical

#### Scenario: Candidate generation fails

- **WHEN** resolution, lock sanitization, import, exact selection, or validation
  fails
- **THEN** the command returns the stable failure and preserves prior output

### Requirement: Deterministic aggregate Extension search

The CLI SHALL provide `extension catalog search [query]` over configured Catalog snapshots with human and `--format json` output. It SHALL match id and summary case-insensitively, retain duplicate curation rows across Catalogs, and use deterministic ordering.

Default search SHALL refresh configured Catalogs. `--no-refresh` SHALL use only stored state, perform no network or execution, and report snapshot age.

#### Scenario: Marketplace search is requested as JSON

- **WHEN** matching entries exist in multiple Catalogs
- **THEN** JSON output contains every matching curation row in deterministic order with source kind and exact pin or locator metadata

#### Scenario: Stored Marketplace search is requested

- **WHEN** `--no-refresh` is supplied
- **THEN** output uses stored snapshots, includes acquisition age, and invokes no package manager or import

### Requirement: Marketplace-facing refresh scope

Default Catalog install SHALL refresh only the explicitly selected configured
Catalog after execution trust is accepted. `--no-refresh` SHALL use only its
stored snapshot and fail deterministically if required snapshot or replay
artifact bytes are absent. Refresh failure SHALL occur before install mutation.

#### Scenario: Install refreshes one Catalog

- **WHEN** a user trusts installation from one configured Catalog without
  `--no-refresh`
- **THEN** only that Catalog refreshes before exact entry selection

#### Scenario: Default Marketplace refresh fails

- **WHEN** the selected Catalog cannot refresh or validate
- **THEN** install fails without invoking Bun or changing installed state

### Requirement: Loaded Extension provenance output

Loaded/listing output SHALL expose exact generic source provenance and, when
present, configured Catalog name, Catalog id, commit, and source locator from the
same generic installed record. Output SHALL NOT imply that the currently
refreshed Catalog commit is the installed commit.

#### Scenario: Offline loaded listing is requested

- **WHEN** a Catalog-curated Extension is listed while offline
- **THEN** output reports persisted installed provenance without refreshing or
  opening the Catalog snapshot

### Requirement: Deterministic Git Catalog command surface
The CLI SHALL keep `extension catalog` commands for add, refresh, list, show, remove, build, and search. Catalog entries and selectors SHALL use stable versionless Extension ids. Catalog-selected installation SHALL use the uniform lifecycle grammar:

```text
ctxindex extension install catalog <catalog> <extension-id> [--no-refresh]
```

Catalog lifecycle and Marketplace read commands SHALL operate on inert stored data only. Catalog install and Catalog-curated update SHALL delegate exact replay to the canonical generic installer and SHALL return source-neutral results and stable errors.

#### Scenario: Versioned selector is supplied
- **WHEN** a Catalog command receives a versioned Extension selector
- **THEN** parsing or validation rejects it

#### Scenario: Catalog lifecycle is requested as JSON
- **WHEN** add, refresh, list, show, remove, search, install, or update is requested with `--format json`
- **THEN** the CLI returns deterministic structured output without prompts

#### Scenario: Catalog package install succeeds
- **WHEN** an explicitly invoked Catalog install passes refresh, replay, selection, collision, and complete validation
- **THEN** output identifies its stable id, Catalog name/id, commit, source kind, exact pin or literal locator, and install/update time

### Requirement: Separate trust acknowledgements
Repository trust, authoring execution trust, and installed-code execution trust SHALL remain separate actions. Catalog add and Catalog build SHALL require their explicit `--trust` acknowledgements before repository acquisition or author-module execution. The explicit `extension install` or `extension update` invocation SHALL itself be the installed-code execution trust grant and SHALL emit a trust notice before default refresh, replay-artifact acquisition, Bun execution, module import, or managed publication. Prior repository or build trust SHALL NOT execute or install an Extension automatically.

#### Scenario: Catalog was trusted but no install is invoked
- **WHEN** a Catalog was previously added or built with trust and the operator only lists, shows, or searches it
- **THEN** no Extension package is imported, executed, or installed

#### Scenario: Explicit install grants execution trust
- **WHEN** the operator invokes the complete `extension install` grammar
- **THEN** the command emits the execution warning and may proceed without a redundant `--trust` flag

### Requirement: Relocated compiled Catalog workflow
The compiled Catalog workflow SHALL cover building a mixed literal/Git/local
Catalog, adding and refreshing it, deterministic search, trusted exact install,
same-Catalog replacement, different-origin collision rejection, origin-neutral
uninstall, relocation of complete state, and offline startup from managed bytes.
Exact npm replay through the shared canonical installer SHALL remain covered by
focused installer tests and the relocated compiled direct npm workflow rather
than a second Catalog-specific registry and tarball fixture.

#### Scenario: Relocated compiled CLI loads mixed Catalog provenance

- **WHEN** generated state is moved and network, Bun, upstream repositories, and
  author checkouts are unavailable
- **THEN** the compiled CLI loads installed package and literal entries from
  managed bytes and reports persisted exact and Catalog provenance

### Requirement: One declarative command model owns parsing and help

The CLI SHALL define every public command, positional, option, alias, enum, default, required marker, description, and subcommand relationship exactly once in its Citty command tree. Runtime handlers MUST consume values parsed from that definition and MUST NOT invoke a second command-specific raw-argument parser or maintain a handwritten usage string.

A generic validation layer derived from the same command definition MUST reject unknown options, duplicate non-repeatable options, missing or empty values, surplus positionals, invalid enums, missing commands, and unknown commands with exit `2` before business logic, secret access, browser launch, database mutation, package acquisition, provider I/O, or network activity.

#### Scenario: Unknown option is supplied

- **WHEN** any command receives an option absent from its resolved Citty definition
- **THEN** it exits `2`, identifies the full command path and option, and performs no command effect

#### Scenario: Dynamic Source option is described and parsed

- **WHEN** a loaded Adapter contributes a generated Source configuration option
- **THEN** the same resolved Citty argument definition renders it in `source add --help`, validates it, and supplies its parsed value to the handler

### Requirement: Help is complete at every command depth

`ctxindex --help` and every nested `--help` invocation SHALL render through the Citty command model and MUST show the complete `ctxindex` command path, exact kebab-case option names, required positionals and options, enum alternatives, defaults, value hints, and trust-boundary descriptions. Root-only interface discovery guidance MUST appear only on root help. Help MUST exit `0`, require no initialization, and perform no mutable or external effect.

The repository SHALL generate one compact web CLI reference projection from the same resolved command tree and SHALL fail a freshness check when the checked-in projection differs. Task-oriented web documentation MUST NOT duplicate a complete handwritten command inventory.

#### Scenario: Deep Catalog help is requested

- **WHEN** an operator runs `ctxindex extension catalog build --help`
- **THEN** usage begins with that complete path and shows its exact required package root, trust option, output option, and descriptions

#### Scenario: Root discovery guidance is scoped

- **WHEN** help is requested for `search` or another nested command
- **THEN** root interface examples are not repeated after the command-specific usage

### Requirement: Coherent resource and operation hierarchy

The public command surface SHALL use these forms and SHALL expose no removed pre-alpha aliases:

```text
ctxindex thread <ref> [--format json]
ctxindex artifact list <ref> [--format json]
ctxindex artifact download <artifact-ref> [--output <path>] [--format json]
ctxindex artifact purge [--format json]
ctxindex describe action <id> [--source <source>] [--format json]
ctxindex action run <id> --source <source> --input <json-or-path> [--format json]
```

`describe action --source` SHALL report exact Source availability while an omitted Source SHALL report registry definition truth. `action` SHALL contain no duplicate describe route. The removed `thread get`, `purge artifacts`, and `action describe` forms MUST fail as invalid usage before opening application state.

#### Scenario: Related Resource thread is retrieved

- **WHEN** an agent invokes `ctxindex thread <ref> --format json`
- **THEN** it receives the same deterministic local Relation traversal without a redundant subcommand

#### Scenario: Action is inspected for one Source

- **WHEN** an agent invokes `ctxindex describe action <id> --source <source> --format json`
- **THEN** output combines the authoritative Action schema with exact Source availability and performs no Action
