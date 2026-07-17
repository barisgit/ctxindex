# apps/cli/src/action/

## Responsibility

Owns CLI workflows for describing and running typed registry Actions.

## Design / patterns

- `handle-action-command.ts` parses input, resolves inline-or-file JSON before dependencies, and always closes dependencies.
- Source references are resolved as exact labels first and IDs second through `SourceService`; core Action services receive only the stable Source ID.
- Injectable dependencies/services keep parsing, output, and failure mapping testable without provider side effects.

## Integration points

- Called by `commands/action.ts`; uses `args/action.ts`, `format/action.ts`, `format/exit.ts`, `SourceService`, and `@ctxindex/core/action`.
