# apps/cli/src/thread/

## Responsibility

Orchestrates local Resource-thread retrieval and presentation across daemon and direct paths.

## Design / patterns

- A selected daemon handles the bounded thread request without client SQLite access or fallback.
- Text output walks the validated tree deterministically; JSON preserves the typed envelope and warnings.

## Integration points

Called by `commands/thread.ts`; uses the daemon client, direct `ThreadService`, and stable exit mapping.
