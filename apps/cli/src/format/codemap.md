# apps/cli/src/format/

## Responsibility

Pure presentation and process-exit adapters for stable text, compact, Markdown, and JSON output.

## Design / patterns

- `oauth-app.ts` renders only provider, label, origin, safe provenance, and lifecycle confirmations; config and secret refs/values never appear.
- `account.ts` renders Accounts, authorization expiry state, and required Source labels without Grant identifiers or scopes; `source.ts` projects the single Source label field that replaced display name and omits internal Grant IDs from JSON.
- Registry renderers derive Provider auth/registration metadata, Adapter access scopes, config flags, and Actions from loaded definitions. Text and Markdown Action renderers expand top-level `oneOf`/`anyOf` inputs into numbered branches.
- Catalog formatters render persisted Git snapshots, package-or-literal replay provenance, versionless Marketplace results, and trusted build results; acquisition timestamps remain intact and derived non-negative snapshot age is surfaced at formatting time. `extension-lifecycle.ts` gives direct and Catalog install/update one source-neutral generic record shape, including materialization digest. Registry formatters expose unified provenance and unavailable managed records; uninstall formatting retains forced-removal data-preservation semantics.
- `exit.ts` centralizes exhaustive auth, sync/provider, Extension lifecycle, and validation code classification. Transported application failures use their closed taxonomy discriminator so lookup `not_found` remains exit `2` and sync `not_found` remains exit `50`; daemon/prototype ownership failures use `50`, and cancellation uses `130`.

## Data & control flow

Handlers supply domain values, formatters return strings, and handlers own stdout/stderr. Registry Action schemas flow through `formatInputText` / `formatInputMarkdown`; union alternatives are labeled in order and delegated to the corresponding object-schema formatter. Errors pass through `mapErrorToExit` without embedding secrets.

## Integration points

Used by commands and workflows under `oauth-app/`, `source/`, `sync/`, `action/`, and `artifact/`; inputs come from public core capabilities.
