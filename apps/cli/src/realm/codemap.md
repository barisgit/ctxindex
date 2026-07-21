# apps/cli/src/realm/

## Responsibility

Orchestrates Realm add/list across selected-daemon and direct core paths.

## Design / patterns

- `commands/realm.ts` defines and validates add/list arguments, then passes a typed `RealmCommandInput` to the handler before any route or storage effect.
- The handler installs request-scoped SIGINT cancellation and never opens direct dependencies after daemon selection.
- Realm inventory uses the shared compact JSON, escaped TSV, or width-aware pretty renderer with stable exit mapping in both daemon and direct modes.

## Integration points

Called by `commands/realm.ts`; shared validation/help comes from `command-model.ts`, while the handler uses the daemon client, direct dependency composition, and Realm formatters.
