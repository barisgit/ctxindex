# apps/cli/src/search/

## Responsibility

Orchestrates search across selected-daemon and direct `SearchPlanner` paths.

## Design / patterns

- Resolves direct Source labels only in direct mode; selected-daemon mode passes semantic filters to daemon-owned orchestration without opening SQLite.
- Preserves JSON, Ref-only, readable result, warning, and explain output while propagating request cancellation.

## Integration points

Called by `commands/search.ts`; uses the daemon client, `SearchPlanner`, direct dependencies, and stable exit mapping.
