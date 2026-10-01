## Context

`formatSearchPretty` delegates to the shared `formatPrettyCollection`, which returns an empty string for zero rows; `printSearch` then skips printing. Text output always contains the TSV header row. `--refs` prints one Ref per result, so it is already silent for zero results. JSON always contains `results` and `warnings`. Formatting happens in the CLI after either the direct planner or the daemon RPC returns, so both routes share one formatter.

Mailbox Adapters (`google.mailbox`, `microsoft.mailbox`) declare `federated` routing. A queryful search calls the provider; `--local-only` searches only the local index, which for a mailbox Source holds only Resources cached by earlier remote searches or retrievals.

## Goals / Non-Goals

**Goals:**

- Make an empty pretty search visibly complete.
- Keep every machine projection byte-for-byte unchanged.
- Explain federated mailbox routing where operators read Extension documentation.

**Non-Goals:**

- Changing empty output for other collection commands or the shared pretty collection formatter.
- Changing routing, caching, warnings, exit codes, or adding hints that depend on Source routing.

## Decisions

1. The empty message belongs to the search pretty formatter, not the shared collection formatter. The issue scopes the change to search, and other commands have their own empty-state expectations.
2. `No results.` is written to stdout. Pretty output is the human projection and is already the stdout payload; stderr remains reserved for warnings and diagnostics.
3. Text output stays header-only TSV. The CLI contract defines text as deterministic escaped TSV for non-TTY stdout, so a sentinel row would corrupt pipelines. The issue's pipeline guarantee maps to text and `--refs`.
4. The routing explanation lives in the authored Google and Microsoft Extension READMEs, which already describe their mailbox Adapters and are served through `ctxindex docs`. The portable agent skill stays provider-neutral.

## Risks / Trade-offs

- [A human reading redirected default output still sees only the TSV header] -> This is the established non-TTY contract; `--format pretty` remains available.
- [Documentation drifts from the embedded generated copy] -> Regenerate the embedded documentation and keep the existing directory-versus-embedded equality test green.
