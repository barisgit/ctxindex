# apps/cli/src/format/

## Responsibility

Pure presentation and process-exit adapters for stable text, compact, Markdown, and JSON output.

## Design / patterns

- `oauth-app.ts` renders only provider, label, origin, safe provenance, and lifecycle confirmations; config and secret refs/values never appear.
- `account.ts` renders Accounts, authorization expiry state, and required Source labels without Grant identifiers or scopes; `source.ts` projects the single Source label field that replaced display name and omits internal Grant IDs from JSON.
- Registry renderers derive Provider auth/registration metadata, Adapter access scopes, config flags, and Actions from loaded definitions. Text and Markdown Action renderers expand top-level `oneOf`/`anyOf` inputs into numbered branches.
- Catalog formatters render deterministic persisted pins, entries, install/uninstall provenance, and snapshot age. Direct formatters expose credential-free requested targets and exact immutable provenance for install/update/list/uninstall results.
- `exit.ts` maps typed core errors to SPEC-stable numeric outcomes and `runWithExit` assigns `process.exitCode`.

## Data & control flow

Handlers supply domain values, formatters return strings, and handlers own stdout/stderr. Registry Action schemas flow through `formatInputText` / `formatInputMarkdown`; union alternatives are labeled in order and delegated to the corresponding object-schema formatter. Errors pass through `mapErrorToExit` without embedding secrets.

## Integration points

Used by commands and workflows under `oauth-app/`, `source/`, `sync/`, `action/`, and `artifact/`; inputs come from public core capabilities.
