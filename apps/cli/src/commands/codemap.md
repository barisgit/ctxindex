# apps/cli/src/commands/

## Responsibility

Defines the citty command tree and thin adapters connecting argv parsers, workflows, core services, formatting, and stable exits.

## Design / patterns

- Each module exports a `defineCommand` descriptor; compound verbs expose nested subcommands and delegate through `runWithExit`.
- `oauth-app.ts` delegates add/list/remove to `oauth-app/handle-oauth-app-command.ts` without argv config fields.
- `account.ts` delegates add/list/remove to `account/handle-account-command.ts`; that workflow preflights and authorizes with one exact provider-matched OAuth App, lists safe Account authorization/labeled-Source inventory, and removes Accounts by global label.
- `source.ts` exposes `--label`, generated Adapter config flags, provider-scoped Account label/ID references, and label-or-ID removal.
- Action, sync, status, and search descriptors advertise Source label-or-ID inputs; search additionally documents opaque single-Source remote continuation, and handlers resolve Source references before core calls.
- `extensions.ts` is a minimal registration re-export; the `extensions/` workflow folder owns the nested Catalog descriptors and core-service delegation.

## Data & control flow

`main.ts` registers descriptors. Citty selects one, the handler parses raw argv, opens full or focused dependencies, delegates core behavior, renders results including local offset or remote continuation pagination, closes dependencies, and returns a stable code. `db.ts` alone retains lazy database module state and rejects database-backed commands before SQLite opening when either explicit-init config or database evidence is absent, with deterministic guidance to run the public `ctxindex init` command.

## Integration points

Consumed by `main.ts`; shared wiring is in `deps.ts`, `definitions.ts`, `args/`, workflow folders including `account/`, `oauth-app/`, and `extensions/`, and `format/`.
