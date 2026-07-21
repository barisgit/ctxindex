## Context

Structured read commands currently use unrelated booleans and command-specific enums, and their formatters range from one-field lines to fixed tables wider than 250 columns. Humans need a readable default in an interactive terminal, while shell-capable agents need deterministic complete output without paying JSON's repeated-key cost. Existing scripts already rely on `--json`, and `export --format` plus `describe --format` already use the word “format” for different domain-specific contracts.

## Goals / Non-Goals

**Goals:**

- Give launch-critical structured reads one predictable format selection and complete semantics.
- Keep long Refs copyable and make ordinary and narrow terminals usable.
- Provide a deterministic low-token text form without weakening compact canonical JSON.
- Preserve warnings on the correct stream and reject ambiguous flag combinations before effects.

**Non-Goals:**

- Redesign remote search paging or add per-Source continuations to merged results.
- Change mutation receipts, Profile export formats, describe document formats, or daemon DTOs.
- Migrate sync before its streaming response design lands.
- Add color, interactive paging, terminal prompts, or a second table dependency.

## Decisions

1. `pretty`, `text`, and `json` are semantic modes, not aliases for individual layouts. `pretty` may choose a table or vertical cards from terminal width; `text` has a fixed grammar; `json` is the existing public value serialized compactly.
2. Omitted selection resolves at execution time from stdout: TTY selects pretty and every non-TTY destination selects text. This prevents pipes and agent shells from receiving box drawing by default.
3. `--json` remains a shorthand to avoid breaking agent integrations, but supplying both `--json` and `--format` is an error even if both request JSON. Silent precedence would hide incorrect invocations.
4. Pretty rendering uses the existing `cli-table3` dependency through one shared renderer. Wide layouts receive explicit semantic columns; narrow output uses one vertical card per record with grapheme-safe pre-wrapping, explicit display-width-bounded columns, `wordWrap`, and no word-boundary slicing. Widths below the table's structural minimum use a plain labeled-card fallback. Wrapped chunks preserve every value character in order.
5. Text collections are escaped TSV with a deterministic header. Null uses reserved `\N`; backslashes, tabs, newlines, and carriage returns are escaped so literal sentinel-like strings remain distinct and each logical record occupies one line. Singular Resources use fixed labeled envelope fields followed by compact JSON for the nested profile and payload.
6. JSON is compact rather than indented. Existing result envelopes and safe inventory projections remain the canonical structures; warnings remain in envelopes instead of being duplicated on stderr.
7. A multi-Source planner cannot expose one Adapter continuation without changing pagination semantics. When it carries a `truncated` warning, the planner replaces the unusable resume instruction with an exact-Source rerun instruction while retaining the Source id.
8. The shared contract applies only to search, get, thread, Artifact list, status, and the five primary inventories. Sync, daemon lifecycle, Profile export, and reference describe formats remain separate. Search `--refs` is a text-only projection and rejects explicit pretty or JSON selectors.

## Risks / Trade-offs

- [Default output changes for redirected human commands] → `--format pretty` remains explicit, and `--json` compatibility is retained.
- [TSV consumers can mishandle escaping] → document the four escapes and test round-tripping of control characters and backslashes.
- [Unbounded pretty values can create tall output] → prefer vertical cards on narrow terminals; semantic completeness is intentionally more important than fixed height.
- [TTY behavior is hard to reproduce in unit tests] → inject width/TTY facts into the shared resolver and renderer while handlers use process defaults.
- [Streaming sync will temporarily retain its existing modes] → document the exception and require the streaming follow-up to map final/event output deliberately.

## Migration Plan

No persistent or deployed state changes. Existing `--json` callers continue to work. Callers that parse readable output must select `--format text` and adopt escaped TSV or labeled-envelope parsing.

## Open Questions

None.
