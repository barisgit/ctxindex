# apps/cli/src/realm/

## Responsibility

Orchestrates Realm add/list across selected-daemon and direct core paths.

## Design / patterns

- `commands/realm.ts` defines and validates add/list arguments, then passes a typed `RealmCommandInput` to the handler before any route or storage effect.
- The handler installs request-scoped SIGINT cancellation and never opens direct dependencies after daemon selection.
- Preserves the existing Realm formatter and stable exit mapping in both modes.

## Integration points

Called by `commands/realm.ts`; shared validation/help comes from `command-model.ts`, while the handler uses the daemon client, direct dependency composition, and Realm formatters.
