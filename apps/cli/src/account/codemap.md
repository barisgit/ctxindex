# apps/cli/src/account/

## Responsibility

Orchestrates CLI authorization and lifecycle operations for globally labeled Accounts and their stable Grants.

## Design / patterns

- `handle-account-command.ts` owns the multi-step add/list/remove workflow so `commands/account.ts` remains a thin citty descriptor.
- Add validates the provider, resolves one persisted same-provider OAuth client, and delegates loopback consent to core authorization; no client credential or refresh-token value is accepted on argv or resolved from the runtime environment.
- List exposes Account/Grant/labeled Source inventory, while remove delegates transactional Source `needs_auth` detachment and Account/Grant secret cleanup to core.
- The handler maps typed failures to stable exits and always closes whichever focused dependency set it opened.

## Data & control flow

`commands/account.ts` passes raw subcommand argv to `handleAccountCommand()`. The handler parses the closed Account grammar, loads registry definitions for add, opens core dependencies, invokes `authorizeProvider()` with `resolveOAuthClient()`, or calls Account/Auth services for list/remove, then renders through `format/account.ts`.

## Integration points

Called by `commands/account.ts`; uses `args/account.ts`, `definitions.ts`, `deps.ts`, `format/account.ts`, `@ctxindex/core/auth`, and `@ctxindex/core/client`.
