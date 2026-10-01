## ADDED Requirements

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
ctxindex thread <ref> [--json]
ctxindex artifact list <ref> [--json]
ctxindex artifact download <artifact-ref> [--output <path>] [--json]
ctxindex artifact purge [--json]
ctxindex describe action <id> [--source <source>] [--json]
ctxindex action run <id> --source <source> --input <json-or-path> [--json]
```

`describe action --source` SHALL report exact Source availability while an omitted Source SHALL report registry definition truth. `action` SHALL contain no duplicate describe route. The removed `thread get`, `purge artifacts`, and `action describe` forms MUST fail as invalid usage before opening application state.

#### Scenario: Related Resource thread is retrieved

- **WHEN** an agent invokes `ctxindex thread <ref> --json`
- **THEN** it receives the same deterministic local Relation traversal without a redundant subcommand

#### Scenario: Action is inspected for one Source

- **WHEN** an agent invokes `ctxindex describe action <id> --source <source> --json`
- **THEN** output combines the authoritative Action schema with exact Source availability and performs no Action

## MODIFIED Requirements

### Requirement: Deterministic direct Extension lifecycle commands
The CLI SHALL expose one singular Extension group with exact source selection for direct and Catalog-curated installation:

```text
extension install <catalog|npm|git|local> <target> <extension-id> [--no-refresh] [--json]
extension update <extension-id> [--json]
extension list [--json]
extension uninstall <extension-id> [--force] [--json]
```

The source-kind positional MUST be exact and MUST prevent target-kind guessing. For `catalog`, target SHALL be one configured Catalog name and `--no-refresh` MAY select its stored snapshot. For `npm`, `git`, or `local`, target SHALL be the requested direct package target and `--no-refresh` MUST be rejected. The stable Extension id MUST be a required positional for every install even when a package exports one root.

Install and update MUST be non-interactive explicit trust grants for arbitrary in-process package code. They MUST NOT prompt or require a redundant trust flag. Help MUST explain the execution trust boundary, and each install or update MUST emit the trust notice to stderr before refresh, acquisition, replay, or import so JSON stdout remains one valid result document. List, startup, and uninstall MUST NOT grant trust or acquire packages. All commands MUST delegate acquisition, persistence, validation, dependency checks, and removal guards to provider-neutral core.

Direct and Catalog-backed commands SHALL share the canonical installer and generic installed-extension record. Install SHALL obey existing origin collision and same-Catalog replacement rules. Update SHALL resolve one exact installed stable id and follow its persisted direct or Catalog provenance without changing origin. Changing target, source kind, Catalog identity, or stable id MUST require uninstall followed by a new install.

Text and JSON output MUST be deterministic. Inventory and successful mutation output MUST include stable Extension id, source kind, sanitized requested target, exact resolved identity, materialization digest, installation/update time, and optional Catalog curation, and MUST NOT include credentials, package-manager authentication, or absolute managed paths. Failure output MUST identify the failed lifecycle stage without leaking target credentials.

#### Scenario: Direct npm install is selected exactly
- **WHEN** an agent runs `extension install npm @example/mail@^2 example.mail --json`
- **THEN** the CLI grants execution trust, delegates one npm candidate for exact `example.mail`, and emits deterministic resolved provenance on success

#### Scenario: Catalog install is selected exactly
- **WHEN** an agent runs `extension install catalog community example.mail --json`
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

### Requirement: Deterministic aggregate Extension search

The CLI SHALL provide `extension catalog search [query]` over configured Catalog snapshots with human and `--json` output. It SHALL match id and summary case-insensitively, retain duplicate curation rows across Catalogs, and use deterministic ordering.

Default search SHALL refresh configured Catalogs. `--no-refresh` SHALL use only stored state, perform no network or execution, and report snapshot age.

#### Scenario: Marketplace search is requested as JSON

- **WHEN** matching entries exist in multiple Catalogs
- **THEN** JSON output contains every matching curation row in deterministic order with source kind and exact pin or locator metadata

#### Scenario: Stored Marketplace search is requested

- **WHEN** `--no-refresh` is supplied
- **THEN** output uses stored snapshots, includes acquisition age, and invokes no package manager or import

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
- **WHEN** add, refresh, list, show, remove, search, install, or update is requested with `--json`
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
