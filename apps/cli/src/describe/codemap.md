# apps/cli/src/describe/

## Responsibility

Owns registry-description selection and source-aware Action inspection behind the public `describe` command.

## Design / patterns

- `handle-describe-command.ts` consumes typed command values and rejects selector, source, format, and full/detail conflicts before loading definitions or opening application state.
- General Profile, Adapter, and Action inventory/detail views load one registry projection and delegate deterministic text, Markdown, or JSON rendering to `format/registry.ts`.
- An exact Action id routes to the Action describe workflow; `--source` is accepted only there and resolves exact Source availability without executing the Action.
- The injectable Action-describe boundary allows focused routing tests without database or provider effects.

## Integration points

- Called by `commands/describe.ts`.
- Uses `definitions.ts`, registry formatters, `action/handle-action-command.ts`, and shared exit mapping; no parallel describe argv parser remains.
