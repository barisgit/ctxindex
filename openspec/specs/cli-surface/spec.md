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
The CLI SHALL retain these explicit direct npm, Git, and local install/update
forms with exact Extension selection and trust alongside loaded-Extension and
Catalog commands:

```text
extensions install <npm|git|local> <target> --extension <id> [--json]
extensions update <id> [--json]
extensions list [--json]
extensions uninstall <id> [--force] [--json]
```

The source-kind positional MUST be exact and MUST prevent target-kind guessing. `--extension <id>` MUST be required for direct install even when the package exports one root. Update and uninstall MUST resolve one exact stable installed Extension id. Changing a direct target or source kind MUST require uninstall followed by a new install; direct update uses the persisted requested target. Catalog install SHALL require an explicit configured Catalog name and versionless Extension id.

Direct install and update MUST be non-interactive explicit trust grants for arbitrary in-process package code. They MUST NOT prompt or require a redundant trust flag. Catalog install MUST require `--trust`. Help MUST explain each trust boundary, and each install or update MUST emit the trust notice to stderr before acquisition or import so JSON stdout remains one valid result document. List, startup, and uninstall MUST NOT grant trust or acquire packages. All commands MUST delegate acquisition, persistence, validation, dependency checks, and removal guards to provider-neutral core.

Direct and Catalog-backed commands SHALL share the canonical installer and generic installed-extension record. Direct install SHALL reject an existing managed stable id. Direct update SHALL require a direct record and SHALL NOT take over Catalog-curated state. Catalog install SHALL replace only the same configured Catalog name and Catalog id. All other managed, builtin, and explicit-path collisions SHALL instruct the user to uninstall first.

Uninstall SHALL remain origin-neutral:

```text
ctxindex extensions uninstall <extension-id>
```

Text and JSON output MUST be deterministic. Inventory and successful mutation output MUST include stable Extension id, source kind, sanitized requested target, exact resolved identity, materialization digest, installation/update time, and optional Catalog curation, and MUST NOT include credentials, package-manager authentication, or absolute managed paths. Failure output MUST identify the failed lifecycle stage without leaking target credentials.

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

#### Scenario: Same Catalog update is explicit

- **WHEN** Catalog install selects the same configured Catalog name and Catalog
  id at a newer commit
- **THEN** trusted exact replay may atomically replace its prior generic record

#### Scenario: Different origin collides

- **WHEN** direct or Catalog install targets an id owned by a different allowed
  origin, builtin, or explicit path
- **THEN** the command fails with uninstall-first guidance and preserves state

#### Scenario: Catalog-curated stable id is uninstalled

- **WHEN** origin-neutral uninstall targets a Catalog-curated record
- **THEN** the CLI removes its generic record and managed bytes without requiring
  refresh, Bun, or Catalog availability

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

The CLI SHALL provide Marketplace search over configured Catalog snapshots with
human and `--json` output. It SHALL match id and summary case-insensitively,
retain duplicate curation rows across Catalogs, and use deterministic ordering.

Default search SHALL refresh configured Catalogs. `--no-refresh` SHALL use only
stored state, perform no network or execution, and report snapshot age.

#### Scenario: Marketplace search is requested as JSON

- **WHEN** matching entries exist in multiple Catalogs
- **THEN** JSON output contains every matching curation row in deterministic
  order with source kind and exact pin or locator metadata

#### Scenario: Stored Marketplace search is requested

- **WHEN** `--no-refresh` is supplied
- **THEN** output uses stored snapshots, includes acquisition age, and invokes no
  package manager or import

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
The CLI SHALL keep explicit commands for Catalog add, refresh, list, show,
remove, build, Marketplace search, and Catalog-selected install. Catalog entries
and selectors SHALL use stable versionless Extension ids.

Catalog install SHALL require an explicit configured Catalog name and trust:

```text
ctxindex extensions install <catalog> <extension-id> --trust [--no-refresh]
```

Catalog lifecycle and Marketplace read commands SHALL operate on inert stored
data only. Catalog install SHALL delegate exact replay to the canonical generic
installer and SHALL return source-neutral results and stable errors.

#### Scenario: Versioned selector is supplied

- **WHEN** a Catalog command receives a versioned Extension selector
- **THEN** parsing or validation rejects it

#### Scenario: Catalog lifecycle is requested as JSON
- **WHEN** add, refresh, list, show, remove, search, or install is requested with
  `--json`
- **THEN** the CLI returns deterministic structured output without prompts

#### Scenario: Catalog package install succeeds

- **WHEN** a trusted exact Catalog entry passes replay, selection, collision, and
  complete validation
- **THEN** output identifies its stable id, Catalog name/id, commit, source kind,
  exact pin or literal locator, and install/update time

### Requirement: Separate trust acknowledgements
Repository, authoring, and install trust SHALL be separate acknowledgements.
Install trust SHALL be checked before default refresh, replay-artifact
acquisition, Bun execution, module import, or managed publication. A prior
repository or build trust SHALL NOT satisfy install trust.

#### Scenario: Install trust is omitted after Catalog trust
- **WHEN** a Catalog was previously added or built with trust but install omits
  `--trust`
- **THEN** the command fails before refresh, acquisition, Bun, or import

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
