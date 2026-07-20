# apps/cli/src/commands/

## Responsibility

Defines the citty command tree and thin adapters connecting argv parsers, workflows, core services, formatting, and stable exits.

## Design / patterns

- Each module exports a `defineCommand` descriptor; compound verbs expose nested subcommands and delegate through `runWithExit`.
- `oauth-app.ts` delegates add/list/remove to `oauth-app/handle-oauth-app-command.ts` without argv config fields.
- `account.ts` delegates add/list/remove to `account/handle-account-command.ts`; that workflow preflights and authorizes with one exact provider-matched OAuth App, lists safe Account authorization/labeled-Source inventory, and removes Accounts by global label.
- `source.ts` obtains generated Adapter config flags from the selected daemon's immutable registry projection (or one shared-owner-protected local snapshot in direct mode) and retains that single route plus projection through execution; its per-invocation cleanup releases a direct owner after help, parse rejection, or handler completion. Realm, Source, search, get, and thread handlers select typed daemon procedures before direct dependencies.
- Action, sync, status, and search descriptors advertise Source label-or-ID inputs; search additionally documents opaque single-Source remote continuation, and handlers resolve Source references before core calls.
- `init.ts` is a thin descriptor that delegates the full leased initialization lifecycle to the top-level `direct-database.ts` boundary.
- `extensions.ts` is a minimal registration re-export; the `extensions/` workflow folder owns the nested Catalog descriptors and core-service delegation.

## Data & control flow

`main.ts` registers descriptors and builds a fresh Source runtime for each `runCli()` invocation. Citty selects one, the handler parses raw argv, uses the retained daemon/direct route where applicable, renders results including local offset or remote continuation pagination, closes dependencies, and returns a stable code; `runCli()` always closes the invocation runtime and preserves route-acquisition exit mapping. `db.ts` retains only the explicit-initialization preflight; leased database ownership lives in `../direct-database.ts`.

## Integration points

Consumed by `main.ts`; shared wiring is in `deps.ts`, `direct-database.ts`, `definitions.ts`, `args/`, workflow folders including `account/`, `oauth-app/`, and `extensions/`, and `format/`.
