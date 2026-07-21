# apps/cli/src/args/

## Responsibility

Defines reusable Citty argument models and typed semantic normalization for the dynamic Source and Search command families.

## Design / patterns

- `source.ts` exports the static Source add/list/remove argument definitions plus registry-derived `--config-*` definitions. Array-valued Adapter options opt into the command model's definition-derived `multiple: true` behavior, while scalar options remain non-repeatable.
- Source normalization selects the positional or option Adapter id, validates their mutual exclusion, maps generated configuration flags back to Adapter properties, parses declared primitive and array types, and produces the provider-neutral add input shape.
- `search.ts` is the single declaration of Search positionals and options. Realm, Source, and field filters are repeatable Citty strings; routing flags and output modes remain typed booleans.
- Search normalization validates dates, counts, typed `name=value` fields, query-less filtering, routing conflicts, and local-offset versus remote-continuation constraints before orchestration starts.
- No module reparses raw argv or renders a handwritten usage string. Generic token validation and collection of repeatable values are owned by `../command-model.ts`; Citty owns enum, default, positional, and base help behavior.

## Data & control flow

`commands/source.ts` and `commands/search.ts` attach these definitions to `defineCtxCommand`. Citty supplies typed parsed values, semantic normalizers produce execution inputs, and handlers receive only those typed values. Dynamic Source definitions use the retained active registry projection for parsing, validation, and help.

## Integration points

Consumed by the Source/Search command descriptors and handlers. Source definitions depend on the core registry description shape; normalized values flow into daemon RPC inputs, `SourceService`, and `SearchPlanner`.
