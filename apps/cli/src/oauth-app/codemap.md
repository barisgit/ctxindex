# apps/cli/src/oauth-app/

## Responsibility

Orchestrates local OAuth App add/list/remove commands without exposing configuration or secret references.

## Design / patterns

- `commands/oauth-app.ts` declares the exact typed add/list/remove grammar and passes an `OAuthAppCommandInput` union to `handle-oauth-app-command.ts`, the workflow boundary.
- On supported hosts, add obtains the Provider-declared `registration.environment` map from the ensured daemon, reads only those names from the current CLI invocation, and sends the bounded record through the owner-private RPC without argv, logs, output, or persistent intermediaries. The daemon validates exact fields and persists it through the secret backend. Unsupported hosts retain the direct retained-owner path.
- Inventory uses the safe OAuth App service projection through shared pretty/text/json rendering; removal remains keyed by exact `(provider, label)` identity.

## Data & control flow

The shared command model validates required provider/label positionals and `--from-env` before effects, then the descriptor passes typed values to the handler. Initialized add/list/remove ensure the daemon and invoke semantic OAuth App procedures; direct fallback retains shared ownership across definition loading and persistence. Inventory remains a safe projection rendered through `format/oauth-app.ts`.

## Integration points

Registered by `commands/oauth-app.ts`; parsing and generated help come from `command-model.ts`. The workflow depends on CLI definitions/dependencies and `@ctxindex/core/oauth-app` plus the environment-reading boundary in core config.
