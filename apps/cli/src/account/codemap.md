# apps/cli/src/account/

## Responsibility

Orchestrates CLI authorization and lifecycle operations for globally labeled Accounts and their stable Grants.

## Design / patterns

- `commands/account.ts` owns the complete Citty grammar and passes a typed `AccountCommandInput` union to `handle-account-command.ts`, which owns the multi-step add/list/remove workflow.
- Add validates the Provider, then either resolves one exact host-policy-matched bundled App when `--app` is omitted or accepts the explicit exact Extension/local App label. The selected label passes through the same OAuth App resolver before loopback consent and private App-config snapshotting; the invocation-current CLI opens the browser unless explicitly disabled, races the local callback with one hidden pasted redirect URL or authorization code for remote terminals, maps raw-mode Ctrl-C to request cancellation, and never accepts or echoes config, token, or authorization values on argv.
- List exposes Account authorization health and labeled Source inventory through shared pretty/text/json rendering without Grant identifiers, scopes, or App configuration; remove delegates transactional Source `needs_auth` detachment and Account/Grant secret cleanup to core.
- The handler maps typed failures to stable exits and always closes whichever focused dependency set it opened.

## Data & control flow

The shared command model validates `account add|list|remove` before effects, and `commands/account.ts` converts inferred Citty values into `AccountCommandInput`. Initialized commands ensure the daemon and use typed Account procedures. Add consumes one authorization event, presents its URL, races automatic loopback completion against hidden pasted input, and sends a manual response through the dedicated response procedure without echoing it. Unsupported platforms retain the prior direct service path. The definition-only fresh-state check preserves unknown-Provider-before-init ordering without opening SQLite.

## Integration points

Called by `commands/account.ts`; uses `daemon/client.ts`, `daemon/ensure.ts`, `definitions.ts`, `deps.ts`, and `format/account.ts`. Shared parsing, validation, and generated help come from `command-model.ts` and the command descriptor.
