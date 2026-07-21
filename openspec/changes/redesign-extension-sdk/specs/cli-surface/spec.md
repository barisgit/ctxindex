## MODIFIED Requirements

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
- **WHEN** an agent runs `oauth-app list --format json`
- **THEN** every row contains only Provider id, label, origin, and safe provenance

### Requirement: Bundled skills surface
ctxindex MUST keep bundled skill guidance consistent with the public CLI and SHOULD ship that documentation alongside the binary so agents can discover usage without external docs. The skills surface SHOULD provide at least:

- a list command that prints bundled skill names and summaries;
- a get command that prints one skill's content, with an option to inline all referenced docs;
- a path command that prints where bundled skills live.

Bundled skill docs MUST be versioned with the ctxindex release that ships them. Agent-facing kinds, fields, filters, formats, Actions, and Adapter flags MUST be derived from loaded definitions and schemas rather than duplicated manually. Hand-written prose is limited to workflow guidance until a future accepted documentation-sidecar contract exists; current definition values MUST NOT embed documentation fields.

Bundled workflow guidance MUST use OAuth App and Account vocabulary, the exact commands in this specification, and MUST NOT teach Client or public Grant concepts.

#### Scenario: Bundled skills use exact OAuth App workflow
- **WHEN** an agent reads bundled authorization guidance
- **THEN** it receives `oauth-app add ... --from-env` followed by `account add ... --app ...` and no Client command or Grant selector
