## MODIFIED Requirements

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
