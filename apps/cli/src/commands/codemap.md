# apps/cli/src/commands/

## Responsibility

Defines the citty command tree and thin adapters connecting argv parsers, workflows, core services, formatting, and stable exits.

## Design / patterns

- Each module exports a `defineCommand` descriptor; compound verbs expose nested subcommands and delegate through `runWithExit`.
- `client.ts` delegates add/list/remove to `client/handle-client-command.ts` without argv secret fields.
- `account.ts` delegates add/list/remove to `account/handle-account-command.ts`; that workflow authorizes with one persisted provider-matched client, lists stable Account/Grant/labeled Source inventory, and removes Accounts by global label.
- `source.ts` exposes `--label`, generated Adapter config flags, provider-scoped Account references, and label-or-ID removal.
- Action, sync, status, and search descriptors advertise Source label-or-ID inputs; handlers resolve them before core calls.
- `extensions.ts` is a minimal registration re-export; the `extensions/` workflow folder owns the nested Catalog descriptors and core-service delegation.

## Data & control flow

`main.ts` registers descriptors. Citty selects one, the handler parses raw argv, opens full or focused dependencies, delegates core behavior, renders results, closes dependencies, and returns a stable code. `db.ts` alone retains lazy database module state.

## Integration points

Consumed by `main.ts`; shared wiring is in `deps.ts`, `definitions.ts`, `args/`, workflow folders including `account/`, `client/`, and `extensions/`, and `format/`.
