# Cli Surface Specification

## Purpose
Define deterministic non-interactive CLI behavior, entity labels and resolution, machine-readable output, and bundled agent skills.
## Requirements
### Requirement: CLI commands, labels, and non-interactive output
The reference CLI MUST provide a deterministic non-interactive OAuth App and Account lifecycle and SHOULD provide commands for initialization, Realm/Source configuration, sync, search, retrieval, typed Actions, status, and maintenance. The specific command set offered by a release is captured in that release's milestone document.

OAuth lifecycle commands MUST include exactly these public forms:

```text
oauth-app add <provider> <label> --from-env
oauth-app list [--format pretty|text|json]
oauth-app remove <provider> <label>
account add <provider> --app <label> [--label <label>]
account list [--format pretty|text|json]
account remove <label>
```

The CLI MUST NOT expose a `client` command, alias, flag, inventory entity, or compatibility route. OAuth App labels MUST resolve only within their explicit Provider. `oauth-app add` and `account add --app` MUST require an exact App label and MUST NOT default, normalize, prompt for, automatically suffix, or guess it even when the Provider has exactly one available App. Account and Source labels MUST remain globally unique bare handles. An omitted Account label MUST default verbatim to the verified Provider identity; an omitted Source label MUST default verbatim to `<account-label>-<adapter-tail>` or `<adapter-tail>` when no Account is required.

`oauth-app add --from-env` MUST use only the active Provider registration's typed top-level config-key-to-environment-variable-name mapping and the central environment loader. It MUST accept no literal config, client id, client secret, token, authorization code, generic JSON config, or secret value as argv. The assembled config MUST pass the Provider's complete config schema before any secret-store write or database mutation. Unknown Provider selection MUST fail before environment/secret reads, database mutation, browser launch, or Provider egress. Missing or invalid config MUST fail before secret-store writes, database mutation, browser launch, or Provider egress.

`oauth-app list` MUST be deterministic and MUST project only Provider id, App label, origin, and safe provenance. Pretty, text, and JSON output MUST NOT include App config, environment names or values, client ids, desktop-secret metadata, typed secret references, tokens, Grant state, or secret values. `oauth-app remove` MUST resolve exact `(providerId,label)` and MUST affect only future authorization; existing Grants continue from their snapshots.

`account add` MUST require `--app <label>`, resolve exact `(providerId,label)`, and fail before secret/database/browser/network effects when the Provider or App is unknown. Authorization MUST use the selected active or persisted local App config and snapshot it into the private Grant. Authorization and refresh MUST NOT reread App config from environment variables.

The launch-critical structured reads `search`, `get`, `thread`, `artifact list`, `status`, `source list`, `realm list`, `account list`, `oauth-app list`, and `extension list` MUST accept `--format pretty|text|json`. Frequent unambiguous options MUST expose these Citty aliases wherever the corresponding long option exists: `-f` for `--format`, `-s` for `--source`, `-r` for `--realm`, `-l` for `--limit`, and `-o` for file `--output`. Generated Adapter configuration flags and ambiguous domain selectors MUST remain long-only. This requirement makes no shared-format claim for any other command. If neither format flag is present, stdout attached to a TTY MUST select `pretty` and non-TTY stdout MUST select `text`. `--format` MUST be the sole output selector, with `-f` as its exact short alias. The CLI MUST NOT expose `--json`; JSON callers MUST use `--format json` or `-f json`. Pretty output MUST adapt to terminal display width, MUST use vertical records when a complete table is not usable, MUST constrain every physical rendered line to the available display columns, and MUST losslessly wrap rather than truncate, ellipsize, or omit semantic values. Text collection output MUST be deterministic escaped TSV: null MUST encode as reserved `\N`, while literal backslash, tab, carriage return, and newline MUST be escaped so every string remains distinct from null. Text singular-Resource output MUST include every envelope field and the complete payload, using compact JSON for nested values. JSON MUST be compact canonical structured output. Successful mutation receipts SHOULD remain terse.

Warnings from those structured reads MUST be written only to stderr in pretty and text modes. In JSON mode warnings MUST remain only in the JSON stdout envelope where that envelope owns warnings. Format selection MUST NOT leak warnings or diagnostics into the opposite stream.

`export --format <profile-format>` MUST retain Profile-declared payload format semantics and `describe --format text|markdown|json` MUST retain reference-document semantics as explicit exceptions. Sync and daemon lifecycle commands retain their separately specified output contracts and MUST NOT be presented as implementing this shared batch-read format contract.

User-facing configuration SHOULD be reachable through CLI commands, while direct TOML MAY remain a power-user path.

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

#### Scenario: Omitted format follows stdout destination
- **WHEN** a structured read is invoked without `--format`
- **THEN** it selects pretty output for TTY stdout and deterministic text for non-TTY stdout

#### Scenario: Removed JSON flag is rejected
- **WHEN** a caller supplies the removed `--json` flag
- **THEN** the CLI exits `2` before opening application dependencies and advertises `--format`

#### Scenario: Narrow pretty output preserves complete values
- **WHEN** pretty collection output contains a Ref longer than the available terminal width
- **THEN** it renders a vertical record whose physical lines fit the available display width and whose wrapped cell chunks preserve every Ref character in order without ellipsis or semantic truncation

#### Scenario: Text null is lossless
- **WHEN** a text collection contains null, the strings `-` and `null`, a literal `\N`, and other backslash-bearing strings
- **THEN** null is `\N`, literal backslashes are escaped, and every value has a distinct deterministic encoding

#### Scenario: Get text is complete
- **WHEN** a caller runs `get <ref> --format text`
- **THEN** stdout contains the complete Resource envelope and payload and readable warnings appear only on stderr

#### Scenario: JSON remains one compact document
- **WHEN** a structured read runs with `--format json` or `-f json`
- **THEN** stdout is one compact canonical JSON document and no warning from its result envelope is duplicated to stderr

#### Scenario: Primary thread and Artifact reads share formats
- **WHEN** a caller invokes `thread <ref>` or `artifact list <ref>`
- **THEN** the command supports the same destination-aware pretty, escaped text, compact JSON, format-alias, and warning-stream rules

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

### Requirement: Durable commands require explicit initialization
Commands that open or mutate ctxindex's database-backed durable state MUST require durable evidence that both backend selection and database bootstrap completed, and MUST fail with the deterministic guidance `ctxindex is not initialized; run ctxindex init` when either is absent. The rejected path MUST NOT create config, database, secret-store, or Keychain state and MUST NOT read Provider-declared OAuth App configuration environment values. Initialization, help, argument validation, Provider validation, and pure definition-discovery surfaces SHALL remain available before initialization.

#### Scenario: Agent adds a local OAuth App before initialization
- **WHEN** an agent runs `oauth-app add <provider> <label> --from-env` with declared configuration environments but without completed initialization evidence
- **THEN** the command exits 2 with guidance to run `ctxindex init`, does not expose or persist App configuration, and creates no durable ctxindex state

#### Scenario: Backend selection persisted but database bootstrap did not complete
- **WHEN** configuration exists but the initialized database does not
- **THEN** a database-backed command exits 2 with initialization guidance before reading OAuth App configuration, opening SQLite, or creating the missing database

#### Scenario: Agent opens another database-backed command before initialization
- **WHEN** an agent runs a syntactically valid database-backed command without completed initialization evidence
- **THEN** the command exits 2 with the same initialization guidance before opening SQLite

#### Scenario: Agent requests help or validates a Provider before initialization
- **WHEN** an agent requests command help, validates a Provider identifier, or runs `bun cli init` without completed initialization evidence
- **THEN** help and Provider validation remain available, and initialization performs its existing backend-selection and database-bootstrap sequence

### Requirement: Live sync output preserves machine-readable results
When daemon sync is selected, the CLI MUST consume the typed stream without
opening the client database or falling back to direct composition. `sync --format json`
MUST emit exactly one final JSON document with the established aggregate result
shape. `sync --format events` MUST emit progress as it arrives and MUST preserve
the established Source completed/failed event shapes. Summary and compact output
MUST preserve their terminal stdout shapes and MAY render bounded live progress
to stderr. Final exit selection MUST remain derived from terminal Source results.

#### Scenario: JSON sync receives progress
- **WHEN** daemon sync yields multiple progress events and returns successfully under `--format json`
- **THEN** stdout contains one valid final JSON document and no partial event documents

#### Scenario: Event-formatted sync receives progress
- **WHEN** daemon sync is invoked with `--format events`
- **THEN** each progress event is written in arrival order before its Source terminal event and before command completion

#### Scenario: Selected stream endpoint disappears
- **WHEN** an exact daemon was selected and its stream fails or disconnects
- **THEN** the CLI returns the declared bounded daemon/cancellation failure and never opens SQLite as fallback

### Requirement: CLI remains the sole agent-facing interface across daemon transport
The CLI MUST remain the only agent-facing integration surface when behavior is routed through the local daemon. It MUST continue to own argument parsing and validation, human-readable and JSON formatting, diagnostics, and final exit-code selection. The local RPC interface MUST NOT become a supported external agent integration surface.

For daemon-routed commands, all input that can be validated without runtime state MUST be validated before any transport request. Successful results and structured domain failures MUST retain the command's existing output and exit behavior regardless of whether the operation executes in-process or through the daemon.

For Realm add/list, Source add/list/remove and the Source-definition projection needed to parse Source configuration, sync/status, search, exact get, and local thread traversal, the CLI MUST select daemon routing when validated lifecycle/discovery metadata exists for the exact canonical runtime tuple or when a test endpoint override explicitly selects it. Once selected, the client process MUST NOT open SQLite, and an unreachable, stale, or lost endpoint MUST report daemon-unavailable with exit `50` without falling back to direct composition. Stateful command paths outside this implemented daemon-routed set are explicitly unconverted and MAY preserve their direct behavior only behind the database-lease fence.

Before any unconverted stateful command composes a runtime or opens SQLite, the CLI MUST resolve the canonical SQLite path and attempt retained shared lease acquisition. Exclusive conflict MUST report `prototype_unsupported` through exit `50` before database open. Successful shared ownership MUST remain held until after SQLite close, while the command otherwise retains existing direct behavior. If the current platform has no retained-lease backend, daemon startup is impossible and the direct command MUST preserve its pre-prototype behavior without a lease; unsupported lock semantics on a platform that otherwise supplies the backend MUST still fail closed.

#### Scenario: Malformed input fails before transport
- **WHEN** an agent invokes a daemon-routed command with malformed arguments or an invalid locally checkable payload
- **THEN** the CLI reports invalid usage through exit code 2 without connecting to or starting the daemon

#### Scenario: Daemon-routed command preserves CLI contract
- **WHEN** a valid daemon-routed command completes successfully
- **THEN** the CLI emits the same documented human-readable or JSON result shape and success exit behavior as the command contract requires
- **THEN** no transport-specific envelope is exposed in command output

#### Scenario: Exact-tuple metadata selects RPC without fallback
- **WHEN** validated lifecycle/discovery metadata exists for the command's exact canonical tuple and the endpoint is unreachable or stale
- **THEN** the CLI reports daemon-unavailable through exit 50 and does not compose a direct runtime

#### Scenario: Test override selects RPC
- **WHEN** a test endpoint override explicitly selects daemon routing
- **THEN** the CLI uses that endpoint and does not fall back to direct behavior on connection failure

#### Scenario: Expanded daemon workflow does not open client storage
- **WHEN** an agent creates or lists a Realm or Source, synchronizes, requests status, searches, retrieves an exact Ref, or traverses a local thread while exact-tuple metadata or a test override selects daemon routing
- **THEN** the CLI delegates the operation through its semantic RPC procedure and does not compose a direct runtime or open SQLite

#### Scenario: Unconverted stateful command cannot bypass daemon ownership
- **WHEN** an agent invokes an unconverted stateful command while a daemon holds the canonical target database lease
- **THEN** the CLI exits 50 with a prototype-unsupported diagnostic before composing a runtime or opening SQLite

#### Scenario: Unconverted stateful command remains direct with shared ownership
- **WHEN** the command acquires a shared lease for its canonical SQLite path
- **THEN** it retains that lease until after close and otherwise preserves its existing direct behavior

#### Scenario: Unsupported platform remains directly usable
- **WHEN** no daemon route is selected and the operating system has no retained-lease backend
- **THEN** an unconverted or directly implemented command preserves its prior SQLite behavior instead of failing with prototype-unsupported

### Requirement: Deterministic daemon lifecycle surface
The CLI SHALL provide background daemon `start`, `status`, and `stop` commands and MUST NOT expose a supported foreground serve command. These operations MUST be non-interactive, MUST support deterministic machine-readable output, and MUST keep readiness/startup and graceful-shutdown observation bounded.

`start` MUST be idempotent and report whether it launched or reused a compatible daemon. `status` MUST NOT launch or mutate a daemon; it MUST distinguish stopped, starting, running, stopping, unavailable/stale, and unsupported state, and running state MUST be backed by a successful compatible health request. `stop` MUST be idempotent, MUST use graceful RPC shutdown for a live daemon, MUST NOT signal a discovery PID, and MUST report completion only after ownership settlement or safe stale-state cleanup.

Ordinary commands MUST preserve the existing explicit selection behavior in this slice: they use a validated compatible daemon when discovery or a test endpoint override selects one and otherwise retain their current direct route. They MUST NOT trigger background startup until every stateful command is daemon-routed or admitted to a tested bootstrap/filesystem-only exception allowlist. After daemon selection, transport loss MUST NOT fall back to direct SQLite.

#### Scenario: Agent explicitly starts twice
- **WHEN** an agent invokes `ctxindex daemon start` twice for the same initialized runtime
- **THEN** both invocations succeed deterministically and the second reports the already-running compatible instance without launching another owner

#### Scenario: Agent inspects running status
- **WHEN** an agent invokes `ctxindex daemon status --format json` for a compatible ready daemon
- **THEN** the CLI reports deterministic running lifecycle, health, readiness, protocol, instance, and active-request state without a transport envelope

#### Scenario: Agent inspects stopped status
- **WHEN** no daemon or matching discovery metadata exists
- **THEN** `ctxindex daemon status` reports stopped successfully and does not start a process

#### Scenario: Agent stops twice
- **WHEN** an agent invokes `ctxindex daemon stop` after the daemon is already stopped
- **THEN** the command succeeds deterministically and reports that no live daemon remained

#### Scenario: Ordinary malformed command has no lifecycle side effect
- **WHEN** an ordinary daemon-backed command has malformed locally checkable input
- **THEN** the CLI exits with invalid usage before discovery, spawn, or transport

#### Scenario: Ordinary command does not start before parity
- **WHEN** no daemon is selected and any stateful command family still requires direct SQLite access
- **THEN** an ordinary command does not launch a daemon as a side effect
- **THEN** the current direct route remains available subject to its ownership fence

#### Scenario: Selected daemon is lost after readiness
- **WHEN** transport becomes unavailable after the command selected or started its daemon
- **THEN** the CLI returns daemon-unavailable through exit 50 and never composes a direct runtime

#### Scenario: Test override is unavailable
- **WHEN** a test endpoint override selects an unreachable endpoint
- **THEN** the CLI returns daemon-unavailable without spawning or falling back

#### Scenario: Unsupported platform runs ordinary command directly
- **WHEN** an ordinary command runs where no retained daemon ownership backend exists
- **THEN** it preserves its prior direct behavior and does not claim a background daemon was started
