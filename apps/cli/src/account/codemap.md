# apps/cli/src/account/

## Responsibility

Orchestrates CLI authorization and lifecycle operations for globally labeled Accounts and their stable Grants.

## Design / patterns

- `handle-account-command.ts` owns the multi-step add/list/remove workflow so `commands/account.ts` remains a thin citty descriptor.
- Add validates the Provider, then preflights the exact OAuth App label across Extension-defined and locally persisted Apps before delegating loopback consent and private App-config snapshotting to core authorization; no config or token value is accepted on argv.
- List exposes Account authorization health and labeled Source inventory without Grant identifiers, scopes, or App configuration; remove delegates transactional Source `needs_auth` detachment and Account/Grant secret cleanup to core.
- The handler maps typed failures to stable exits and always closes whichever focused dependency set it opened.

## Data & control flow

`commands/account.ts` passes raw subcommand argv to `handleAccountCommand()`. Add loads the complete registry, merges its App labels with a read-only local `oauth_apps` lookup for preflight guidance, then invokes `authorizeProvider()` with `OAuthAppService.resolveApp()`. List/remove call Account/Auth services and render through `format/account.ts`.

## Integration points

Called by `commands/account.ts`; uses `args/account.ts`, `definitions.ts`, `deps.ts`, `format/account.ts`, `@ctxindex/core/auth`, and `@ctxindex/core/oauth-app`.
