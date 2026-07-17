# Cli Surface Specification

## Purpose
Define deterministic non-interactive CLI behavior, entity labels and resolution, machine-readable output, and bundled agent skills.

## Requirements

### Requirement: CLI commands, labels, and non-interactive output
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

The reference CLI SHOULD provide commands for initialization, OAuth Client configuration, Account authorization, realm/source configuration, sync, search, retrieval, typed Actions, status, and maintenance. The specific command set offered by a release is captured in that release's milestone document.

OAuth lifecycle commands MUST include `client add <provider> [--label <label>] --from-env`, `client list`, `client remove <provider> <label>`, `account add <provider> [--label <label>] [--client <label>]`, `account list`, and `account remove <label>`. Client labels MUST resolve only within their explicit provider; Account and Source labels MUST be globally unique bare handles. An omitted Client label MUST default verbatim to the provider id, an omitted Account label MUST default verbatim to the verified provider identity, and an omitted Source label MUST default verbatim to `<account-label>-<adapter-tail>` or `<adapter-tail>` when no Account is required. Labels MUST NOT be normalized, prompted for, or automatically suffixed.

OAuth client credentials MUST be read from the provider's declared environment names only during `client add --from-env` and persisted through typed secret references. Account authorization and token refresh MUST use the persisted Client/Grant records and MUST NOT re-read Client credentials from the environment. With one Client for a provider, `account add` MUST select it automatically; with none or more than one, it MUST fail with actionable Client-add or `--client` guidance.

CLI output SHOULD be token-efficient by default: compact human-readable text with one item per line and only key fields. Verbose human output and machine-readable JSON SHOULD be opt-in flags.

Every read command SHOULD support a machine-readable JSON output mode.

User-facing configuration SHOULD be reachable through CLI commands. Direct TOML editing MAY remain as a power-user path, but the CLI MUST be able to express the same configuration without hand-edited TOML.

The CLI MUST NOT use interactive TTY prompts for required input. Every required input MUST be expressible via non-secret flags, environment variables, typed secret references, or explicitly declared stdin. Missing required input MUST fail with a clear error and a non-zero exit code, not by waiting for an interactive answer. The one permitted interactive surface is a user's browser during an explicitly requested OAuth authorization redirect. Headless and agent-driven flows MUST use a declared environment/secret input path; long-lived tokens, client secrets, and authorization codes MUST NOT be accepted as literal process arguments.

References to entities that do not exist (unknown realm, Client label, Account label/id, Source label/id, Grant id, or adapter id) MUST fail fast with an actionable error message and MUST NOT auto-create the missing entity unless an explicit create flag is passed. Source-referencing commands MUST accept an exact Source label wherever they accept a Source id.

#### Scenario: CLI operations remain deterministic and agent-safe
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

### Requirement: Bundled skills surface
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

ctxindex SHOULD ship bundled skill documentation alongside the binary so agents can discover usage without external docs. The skills surface SHOULD provide at least:

- a list command that prints bundled skill names and summaries;
- a get command that prints one skill's content, with an option to inline all referenced docs;
- a path command that prints where bundled skills live.

Bundled skill docs MUST be versioned with the ctxindex release that ships them.

Agent-facing documentation of kinds, fields, filters, formats, Actions, and adapter flags MUST be derived from the loaded definitions (profiles, adapters, config schemas), not hand-maintained in parallel. Hand-written prose is limited to workflow guidance and definition-level `docs` fields.

#### Scenario: Bundled skills remain versioned and registry-derived
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings
