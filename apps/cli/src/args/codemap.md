# apps/cli/src/args/

## Responsibility

Pure argument-parsing layer that converts raw argv segments into typed command descriptors for CLI handlers.

## Design / patterns

- Parsers return discriminated unions keyed by `kind`, including operation, `help`, and `unknown` variants.
- `flags.ts` centralizes `parseFlags`, `hasHelpFlag`, `stringFlag`, and `listFlag`; its opt-in strict mode returns typed unknown/duplicate/missing-value failures for closed command grammars while non-strict parsing retains repeatable flags.
- Ref-bearing parsers (`artifact.ts`, `export.ts`, `get.ts`, `thread-get.ts`) validate with `parseRef`.
- `source.ts` derives dynamic `--config-*` value flags from `SourceDescription.configOptions` and coerces declared primitive/array types.
- `describe.ts` validates the progressive selector/id grammar, text/Markdown/JSON formats, and explicit `--full` snapshot mode while rejecting redundant or conflicting forms.
- Each command module exports usage text alongside its parser and result types.

## Data & control flow

1. A command handler passes its remaining `string[]` to `parse*Args`.
2. Help detection and flag decomposition separate options from positionals.
3. The parser validates subcommands, required values, conflicts, refs, and command-specific values.
4. Success returns a typed operation; invalid input returns `{ kind: "unknown", message }`; handlers perform all I/O.

Notable specializations include date/limit/field parsing in `search.ts`, auth-flow exclusivity in `auth.ts`, and sync mode/output selection in `sync.ts`.

## Integration points

- Consumed by matching modules under `apps/cli/src/commands/`, plus handlers under `action/`, `artifact/`, `auth/`, `source/`, and `sync/`.
- Domain types come from `@ctxindex/core`, `@ctxindex/core/registry`, `@ctxindex/core/secrets`, and `@ctxindex/extension-sdk`.
- Production parser modules are `action.ts`, `artifact.ts`, `auth.ts`, `describe.ts`, `export.ts`, `extensions.ts`, `get.ts`, `purge.ts`, `realm.ts`, `search.ts`, `secrets.ts`, `skills.ts`, `source.ts`, `status.ts`, `sync.ts`, and `thread-get.ts`.
