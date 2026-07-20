# apps/cli/src/args/

## Responsibility

Pure argv parsing into typed discriminated command unions.

## Design / patterns

- `flags.ts` centralizes help, scalar/list extraction, duplicate detection, and strict closed-grammar failures.
- `oauth-app.ts` accepts add-from-environment, safe list, and exact provider/label removal; no configuration value is accepted on argv.
- `account.ts` requires an exact OAuth App label for provider authorization and accepts optional Account labels, deterministic inventory, and label removal.
- `daemon.ts` defines the exact foreground `serve`, side-effect-free `health`, and graceful `shutdown` grammar; `status.ts` now uses the same strict unknown/duplicate/missing-value and positional rejection as `sync.ts`.
- `source.ts` derives `--config-*` values from a minimal active-registry projection, accepts `--label` and Account label/Account ID references, rejects removed forms, and keeps list/remove grammar independent of registry loading.
- Ref-bearing parsers validate stable `ctx://` / Artifact Refs; search/sync/status/Action source flags remain strings for later label-or-ID resolution.
- Source add preflights common grammar and potentially generated `--config-*` value shape before active-definition retrieval, then performs Adapter-specific option/type validation against that immutable projection.
- `search.ts` permits query-less filtered remote execution and accepts a non-blank opaque `--continuation` only with `--remote`, exactly one `--source`, and no `--offset`; offsets remain local-only pagination.
- `extensions.ts` keeps exact Catalog `<id>@<version>` selectors and trust/refresh flags distinct from direct `npm|git|local` target plus `--extension <id>` forms, and owns direct update/uninstall/force grammar without performing acquisition.

## Data & control flow

Handlers pass remaining argv to `parse*Args`; parsers split flags/positionals, validate required values and conflicts, then return an operation, `help`, or `{ kind: "unknown", message }`. Parsers perform no I/O.

## Integration points

Consumed by matching command/workflow modules. Domain grammar types come from core registry, source, secrets, and Ref capabilities.
