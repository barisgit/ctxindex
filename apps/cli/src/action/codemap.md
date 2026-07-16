# apps/cli/src/action/

## Responsibility

Owns the CLI workflow for describing and running typed registry Actions after the Citty declaration delegates raw argv.

## Design / patterns

- `handle-action-command.ts` parses with `args/action.ts`, resolves inline-or-file JSON before opening dependencies, invokes public core Action services, formats through `format/action.ts`, maps exits, prints warnings, and always closes opened dependencies.
- Injectable dependency and service Interfaces keep command behavior testable without provider or storage side effects.
- Focused tests live beside the handler and cover arbitrary JSON inputs, parse-before-deps, exact service arguments, output/warnings, error exits, and closure.

## Integration points

- Called only by `commands/action.ts`.
- Uses `@ctxindex/core/action`, CLI dependency composition, shared Action parsing, output formatting, and exit mapping.
