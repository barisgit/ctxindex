## Why

The current CLI has command-specific output flags and renderers: wide fixed tables overflow ordinary terminals, some readable views omit essential Resource data, and collection text is inconsistent for agent consumption. This makes the primary shell integration difficult for both people and token-sensitive agents immediately before launch.

## What Changes

- Add one shared `--format pretty|text|json` contract to the exact launch-critical reads: search, get, thread, Artifact list, status, and Source, Realm, Account, OAuth App, and Extension inventories, with `pretty` selected on a TTY and `text` otherwise.
- Retain `--json` as a shorthand for `--format json`, while rejecting an invocation that supplies both options.
- Make pretty output terminal-width-aware, switch narrow collections to vertical cards, and preserve complete semantic values including long Refs.
- Make text output deterministic and low-token: escaped TSV with reserved `\N` nulls for collections and a labeled complete envelope with compact nested JSON for singular Resources.
- Keep JSON compact, canonical, and structurally complete; route readable warnings to stderr while retaining warnings in JSON result envelopes.
- Make `get` readable formats return the complete Resource envelope and payload, and make search results usable without ellipsizing Refs.
- Correct multi-Source remote truncation guidance so it never promises a continuation that the merged result cannot expose and instead instructs the operator to rerun against the exact Source.
- Keep mutation receipts terse. `export` keeps Profile-defined payload formats and `describe` keeps its reference-document formats as explicit exceptions.
- Keep sync and daemon lifecycle output as explicitly separate contracts.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cli-surface`: Replace command-specific readable modes on structured reads with the shared pretty, text, and JSON output contract.
- `search-routing`: Specify complete Ref rendering and truthful continuation guidance for multi-Source remote truncation.

## Impact

The change affects `@ctxindex/cli` parsing, shared formatters, structured read handlers, help and bundled guidance, plus provider-neutral search warning projection. It reuses the existing `cli-table3` dependency, changes default non-TTY output, and intentionally does not alter stored data, provider access, daemon RPC shapes, export payload formats, or describe reference formats.
