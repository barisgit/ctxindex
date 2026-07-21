# apps/cli/src/action/

## Responsibility

Owns CLI workflows for inspecting and executing typed registry Actions.

## Design / patterns

- `handle-action-command.ts` consumes only exact-Source availability describe or run input. Run resolves inline-or-file JSON before daemon ensure or dependency opening; source-aware describe and run use bounded typed daemon procedures when supported, retain direct execution only for unsupported platforms, and never fall back after selection. Source-less Action definition truth bypasses this stateful workflow and comes from the generated registry projection.
- Source references are resolved as exact labels first and IDs second through the daemon-owned or direct `SourceService`; core Action services receive only the stable Source ID.
- Injectable dependencies/services keep input preparation, output, and failure mapping testable without provider side effects.
- Public mutation remains under `action run`; source-aware inspection reaches the describe branch through `describe/handle-describe-command.ts`.

## Integration points

- Called by `commands/action.ts` for execution and `describe/handle-describe-command.ts` for inspection.
- Uses `daemon/ensure.ts`, `daemon/client.ts`, `format/action.ts`, shared exit mapping, `SourceService`, and `@ctxindex/core/action`; no command-specific argv parser remains.
