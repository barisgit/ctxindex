# apps/cli/src/args/

## Responsibility

Pure argv parsing into typed discriminated command unions.

## Design / patterns

- `flags.ts` centralizes help, scalar/list extraction, duplicate detection, and strict closed-grammar failures.
- `client.ts` accepts only add-from-environment, safe list, and provider-scoped remove; no client credential value is accepted on argv.
- `account.ts` accepts provider authorization with optional Account/client labels, deterministic inventory, and label removal.
- `source.ts` derives `--config-*` values from registry descriptions, accepts `--label` and Account label/Account ID/Grant ID references, and rejects removed `--name` / `--display-name` forms.
- Ref-bearing parsers validate stable `ctx://` / Artifact Refs; search/sync/status/Action source flags remain strings for later label-or-ID resolution.
- `extensions.ts` owns the closed Catalog lifecycle grammar, exact `<id>@<version>` selectors, and separate repository/install trust acknowledgements.

## Data & control flow

Handlers pass remaining argv to `parse*Args`; parsers split flags/positionals, validate required values and conflicts, then return an operation, `help`, or `{ kind: "unknown", message }`. Parsers perform no I/O.

## Integration points

Consumed by matching command/workflow modules. Domain grammar types come from core registry, source, secrets, and Ref capabilities.
