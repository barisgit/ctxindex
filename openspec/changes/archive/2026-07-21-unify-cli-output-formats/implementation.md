## Capability Implementation Targets

- `cli-surface` → `openspec/specs/cli-surface/implementation.md`
- `search-routing` → `openspec/specs/search-routing/implementation.md`

## Module Ownership

`@ctxindex/cli` owns `OutputFormat`, resolution of explicit flags versus injected stdout facts, escaped scalar/TSV serialization, terminal-width layout selection, and complete Resource presentation. Command definitions declare the shared flags and handlers pass domain or RPC result values into formatters; neither core nor RPC depends on terminal presentation.

The provider-neutral core search planner continues to own merged pagination and normalized warning projection. Adapters report Source-local warnings and optional Source-local continuation; the planner is the only layer with enough information to replace continuation guidance when multiple Sources are merged. No Microsoft-specific branch enters the CLI.

## Interfaces and Data Flow

The CLI exposes one shared semantic type and resolver:

```ts
export type OutputFormat = 'pretty' | 'text' | 'json'

export interface OutputSelection {
  readonly format?: OutputFormat
  readonly json?: boolean
}

export interface OutputEnvironment {
  readonly isTTY: boolean
  readonly columns?: number
}

export function resolveOutputFormat(
  selection: OutputSelection,
  environment?: OutputEnvironment,
): OutputFormat;
```

Command definitions reuse one `outputFormatArg` declaration and structured reads reuse `structuredOutputArgs`. The generic command-model validation continues to reject unknown and duplicate options. `--format` is the sole selector and carries the Citty alias `-f`; the removed `--json` token is rejected by ordinary unknown-option validation. `--refs` remains a Search-specific text projection. Argument resolution forces omitted selection to text and rejects explicit JSON or pretty before dependencies open.

The shared presentation module accepts ordered column/field descriptions rather than domain service objects. Its TSV serializer reserves `\N` for null, escapes literal backslashes before tab, carriage return, and newline, and emits a stable header plus one physical line per row. Its pretty collection renderer measures display width, grapheme-wraps labels and values before `cli-table3`, uses explicit bounded columns with `wordWrap` above the table's structural minimum, and falls back to plain labeled cards below it. Both paths preserve every character across wrapped chunks. Domain formatters remain responsible for safe field selection and ordering.

Singular Resource formatting consumes the existing complete `SourceResourceResult` / RPC equivalent. JSON serializes the whole result envelope compactly. Text emits every Resource envelope key in a stable order and compact JSON for `profile`, `payload`, and any other nested value. Pretty emits the same information as a vertical table plus a full payload section. Handlers print warnings to stderr only when the resolved mode is not JSON.

Search JSON continues to serialize the complete planner result. Text emits stable ordered result fields as escaped TSV. Pretty uses a width-aware result schema that always includes complete Ref; warnings and explain diagnostics stay on stderr outside JSON. The core planner rewrites only `truncated` warning text for multi-Source executions, retaining the normalized Source id/code and leaving exact-Source continuation envelopes unchanged.

Thread flattens its ordered tree into complete Resource rows with explicit depth for pretty/text while JSON retains the typed tree envelope. Artifact list projects descriptor rows through the same collection renderer. Sync, daemon lifecycle, export, and describe remain separate format domains.

## Storage and State

Not applicable. Format selection and width are per-process ephemeral facts. No durable state or daemon transport shape changes.

## Security and Compatibility

Safe inventory projections remain domain-formatter responsibilities and must not grow secret or Grant fields. Escaping is presentation-only and must not reinterpret values. Compact JSON remains one stdout document, and warning routing preserves clean machine output. Sync, daemon lifecycle, export, and describe retain their independent format domains but share `--format`/`-f`; sync maps `json` to its atomic terminal result and keeps `events` for streaming.

## Verification

Pure formatter tests cover format resolution, compact JSON, TSV escaping, complete Resource fields/payload, width breakpoints, vertical cards, and long Ref preservation. Command tests prove removed `--json` is rejected before dependency effects, aliases resolve through Citty, and verify warning stream ownership. Existing inventory tests are migrated to the shared modes without weakening their safe-field assertions. Search planner tests prove multi-Source truncation guidance and exact-Source continuation preservation. Help/reference tests cover the common enum and exceptions. Repository typecheck, lint, CLI thinness gates, full CI, and strict OpenSpec validation remain required.

## Promotion Notes

- Merge the shared `OutputFormat` resolver, presentation ownership, complete Resource formatting, stream separation, exceptions, and verification doctrine into `openspec/specs/cli-surface/implementation.md`.
- Merge planner-owned multi-Source truncation-warning normalization and its exact-Source preservation tests into `openspec/specs/search-routing/implementation.md`.
