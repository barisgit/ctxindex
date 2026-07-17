# apps/cli/src/format/

## Responsibility

Pure presentation and process-exit adapters for stable text, compact, Markdown, and JSON output.

## Design / patterns

- `client.ts` renders only provider, label, and timestamps plus lifecycle confirmations; secret refs/values never appear.
- `account.ts` renders Accounts, stable Grants, and required Source labels; `source.ts` projects the single Source label field that replaced display name.
- Registry renderers derive provider endpoints, declared client environment names, scopes, config flags, and Actions from loaded definitions.
- `exit.ts` maps typed core errors to SPEC-stable numeric outcomes and `runWithExit` assigns `process.exitCode`.

## Data & control flow

Handlers supply domain values, formatters return strings, and handlers own stdout/stderr. Errors pass through `mapErrorToExit` without embedding secrets.

## Integration points

Used by commands and workflows under `client/`, `source/`, `sync/`, `action/`, and `artifact/`; inputs come from public core capabilities.
