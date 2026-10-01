## Why

Human-readable search prints nothing when no Resource matches. For mailbox Sources this is common: they are federated, so `search --local-only` reads only locally cached messages and is often empty. Silence looks like a hung or broken command, and the mailbox documentation does not explain why the default search and `--local-only` differ (GitHub issue #80).

## What Changes

- Pretty search output prints `No results.` when the result set is empty.
- Text output keeps its deterministic header-only TSV, `--refs` keeps printing nothing, and JSON keeps its unchanged envelope. These remain the pipeline and agent projections.
- Warnings, explain diagnostics, pagination, continuations, direct/daemon parity, and exit codes are unchanged; an empty result set still exits `0`.
- The Google and Microsoft Extension documentation explains that mailbox Sources are federated: normal search routes to the provider, and `--local-only` searches only messages already cached locally.

The issue predates the unified `pretty|text|json` output contract. Its "human-readable" mode maps to `pretty`, the default for TTY stdout; its `--json` maps to `--format json`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `search-routing`: Search output defines an explicit empty outcome for pretty output and pins the unchanged empty text, refs, and JSON projections.

## Impact

The thin CLI search formatter and the authored built-in Google and Microsoft Extension documentation, including its generated embedded copy. Core search planning, daemon RPC, Adapters, routing, and storage are unchanged.
