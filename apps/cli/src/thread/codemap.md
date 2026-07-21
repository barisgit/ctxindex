# apps/cli/src/thread/

## Responsibility

Orchestrates local Resource-thread retrieval and presentation across daemon and direct paths.

## Design / patterns

- `handle-thread-get-command.ts` consumes the typed `thread <ref>` input and validates the Resource Ref before daemon selection or direct dependency opening.
- A selected daemon handles the bounded thread request without client SQLite access or fallback.
- Pretty/text output flattens the validated tree into complete Resource rows with explicit depth through `format/thread.ts`; JSON preserves the typed envelope and warnings.

## Integration points

Called by the leaf `commands/thread.ts` definition; uses the daemon client, direct `ThreadService`, and stable exit mapping. The former redundant nested operation and its argv parser are absent.
