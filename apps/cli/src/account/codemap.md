# apps/cli/src/account/

## Responsibility

Orchestrates CLI authorization and lifecycle operations for globally labeled Accounts and their stable Grants.

## Design / patterns

- `commands/account.ts` owns the complete Citty grammar and passes a typed `AccountCommandInput` union to `handle-account-command.ts`, which owns the multi-step add/list/remove workflow.
- Add validates the Provider, then either resolves one exact host-policy-matched bundled App when `--app` is omitted or accepts the explicit exact Extension/local App label. The selected label passes through the same OAuth App resolver in one retained shared-lease dependency lifetime before loopback consent and private App-config snapshotting; no config or token value is accepted on argv.
- List exposes Account authorization health and labeled Source inventory through shared pretty/text/json rendering without Grant identifiers, scopes, or App configuration; remove delegates transactional Source `needs_auth` detachment and Account/Grant secret cleanup to core.
- The handler maps typed failures to stable exits and always closes whichever focused dependency set it opened.

## Data & control flow

The shared command model validates `account add|list|remove` before effects, and `commands/account.ts` converts inferred Citty values into `AccountCommandInput`. On initialized state, add opens the complete registry and local App inventory through `openDeps()`, retains that ownership through `authorizeProvider()`, and resolves the selected value with `OAuthAppService.resolveApp()`. Omitted selection first calls the pure managed-policy resolver over the complete registry and bundled release policy; explicit selection bypasses it. Managed failure adds deterministic local BYOA commands without starting a second flow. The definition-only fresh-state check preserves unknown-Provider-before-init ordering without opening SQLite. List/remove call Account/Auth services and render through `format/account.ts`.

## Integration points

Called by `commands/account.ts`; uses `definitions.ts`, `deps.ts`, `format/account.ts`, `@ctxindex/core/auth`, and `@ctxindex/core/oauth-app`. Shared parsing, validation, and generated help come from `command-model.ts` and the command descriptor.
