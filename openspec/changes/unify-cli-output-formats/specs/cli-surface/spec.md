## MODIFIED Requirements

### Requirement: CLI commands, labels, and non-interactive output
The reference CLI MUST provide a deterministic non-interactive OAuth App and Account lifecycle and SHOULD provide commands for initialization, Realm/Source configuration, sync, search, retrieval, typed Actions, status, and maintenance. The specific command set offered by a release is captured in that release's milestone document.

OAuth lifecycle commands MUST include exactly these public forms:

```text
oauth-app add <provider> <label> --from-env
oauth-app list [--format pretty|text|json] [--json]
oauth-app remove <provider> <label>
account add <provider> --app <label> [--label <label>]
account list [--format pretty|text|json] [--json]
account remove <label>
```

The CLI MUST NOT expose a `client` command, alias, flag, inventory entity, or compatibility route. OAuth App labels MUST resolve only within their explicit Provider. `oauth-app add` and `account add --app` MUST require an exact App label and MUST NOT default, normalize, prompt for, automatically suffix, or guess it even when the Provider has exactly one available App. Account and Source labels MUST remain globally unique bare handles. An omitted Account label MUST default verbatim to the verified Provider identity; an omitted Source label MUST default verbatim to `<account-label>-<adapter-tail>` or `<adapter-tail>` when no Account is required.

`oauth-app add --from-env` MUST use only the active Provider registration's typed top-level config-key-to-environment-variable-name mapping and the central environment loader. It MUST accept no literal config, client id, client secret, token, authorization code, generic JSON config, or secret value as argv. The assembled config MUST pass the Provider's complete config schema before any secret-store write or database mutation. Unknown Provider selection MUST fail before environment/secret reads, database mutation, browser launch, or Provider egress. Missing or invalid config MUST fail before secret-store writes, database mutation, browser launch, or Provider egress.

`oauth-app list` MUST be deterministic and MUST project only Provider id, App label, origin, and safe provenance. Pretty, text, and JSON output MUST NOT include App config, environment names or values, client ids, desktop-secret metadata, typed secret references, tokens, Grant state, or secret values. `oauth-app remove` MUST resolve exact `(providerId,label)` and MUST affect only future authorization; existing Grants continue from their snapshots.

`account add` MUST require `--app <label>`, resolve exact `(providerId,label)`, and fail before secret/database/browser/network effects when the Provider or App is unknown. Authorization MUST use the selected active or persisted local App config and snapshot it into the private Grant. Authorization and refresh MUST NOT reread App config from environment variables.

Structured read commands MUST accept `--format pretty|text|json`. If neither format flag is present, stdout attached to a TTY MUST select `pretty` and non-TTY stdout MUST select `text`. `--json` MUST remain an exact shorthand for `--format json`, and combining `--json` with any `--format` value MUST fail as invalid usage before command effects. Pretty output MUST adapt to terminal width, MUST use vertical records when a complete table is not usable, and MUST NOT truncate, ellipsize, or omit semantic values. Text collection output MUST be deterministic escaped TSV; text singular-Resource output MUST include every envelope field and the complete payload, using compact JSON for nested values. JSON MUST be compact canonical structured output. Successful mutation receipts SHOULD remain terse.

Warnings from structured reads MUST be written only to stderr in pretty and text modes. In JSON mode warnings MUST remain only in the JSON stdout envelope where that envelope owns warnings. Format selection MUST NOT leak warnings or diagnostics into the opposite stream.

`export --format <profile-format>` MUST retain Profile-declared payload format semantics and `describe --format text|markdown|json` MUST retain reference-document semantics as explicit exceptions. `sync` MAY retain its existing output arguments until streaming response output is specified, but its streaming follow-up MUST define an intentional mapping to the shared modes.

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
- **WHEN** an agent runs `oauth-app list --json`
- **THEN** every row contains only Provider id, label, origin, and safe provenance

#### Scenario: Omitted format follows stdout destination
- **WHEN** a structured read is invoked without `--format` or `--json`
- **THEN** it selects pretty output for TTY stdout and deterministic text for non-TTY stdout

#### Scenario: Conflicting output selectors are rejected
- **WHEN** a caller supplies both `--json` and `--format pretty|text|json`
- **THEN** the CLI exits `2` before opening application dependencies

#### Scenario: Narrow pretty output preserves complete values
- **WHEN** pretty collection output contains a Ref longer than the available terminal width
- **THEN** it renders a vertical record with the complete copyable Ref and no ellipsis or semantic truncation

#### Scenario: Get text is complete
- **WHEN** a caller runs `get <ref> --format text`
- **THEN** stdout contains the complete Resource envelope and payload and readable warnings appear only on stderr

#### Scenario: JSON remains one compact document
- **WHEN** a structured read runs with `--format json` or `--json`
- **THEN** stdout is one compact canonical JSON document and no warning from its result envelope is duplicated to stderr
