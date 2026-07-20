# apps/cli/src/realm/

## Responsibility

Orchestrates Realm add/list across selected-daemon and direct core paths.

## Design / patterns

- Parses before side effects, installs request-scoped SIGINT cancellation, and never opens direct dependencies after daemon selection.
- Preserves the existing Realm formatter and stable exit mapping in both modes.

## Integration points

Called by `commands/realm.ts`; uses the daemon client, direct dependency composition, and Realm formatters.
