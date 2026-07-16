## Context

The CLI currently appends a full registry dump after every Citty help page. That dump mixes a second visual language into help, grows linearly with Extensions, and serializes Action JSON Schema on one line. The existing `describe [profile|adapter|action] [id]` grammar already contains the selector and identity needed for progressive discovery, but every form currently renders complete entries.

## Goals / Non-Goals

**Goals:**
- Keep help concise, Citty-styled, and sufficient to discover the dedicated registry interface.
- Make default and selector-only describe calls bounded indexes.
- Make exact-id describe calls readable full details.
- Preserve a deliberate full-snapshot escape hatch.
- Keep JSON lossless at detail/full levels and deterministic at every level.

**Non-Goals:**
- Change loaded registry definitions, validation, Source configuration parsing, provider behavior, or storage.
- Add interactive selection, pagination, or compatibility aliases.
- Treat text/Markdown as a machine contract when JSON is available.

## Decisions

### D1. Reuse selector and id as the list/detail boundary

`describe` renders a compact grouped index, `describe <selector>` renders a compact list for that definition class, and `describe <selector> <id>` renders one full detail. This avoids new list/show subcommands and keeps exact lookup short for agents.

### D2. Make full snapshots explicit

`--full` expands all matched definitions: all classes without a selector or one class with a selector. Exact-id forms are already detailed and reject redundant `--full`. Bare JSON becomes compact; callers needing the prior snapshot use `describe --full --json`.

### D3. Match output cardinality to the query

Compact all-class JSON is an object of compact arrays; selector-only JSON is a compact array; exact-id JSON is one full object. `--full` returns the existing full object or selected full array. This lets agents infer whether they requested a collection or a resource.

### D4. Keep exact schemas in JSON and render constraints structurally in text/Markdown

Full text and Markdown enumerate object input properties with type, requiredness, and JSON Schema constraints such as item bounds, string bounds, patterns, formats, enums, numeric bounds, defaults, and additional-property policy. Unsupported or composite schema fragments fall back locally to compact JSON rather than collapsing the entire input into one blob. Examples use indented or fenced JSON.

### D5. Help advertises discovery but does not activate and dump registries

After Citty usage, help prints a short `INTERFACE` section naming compact discovery, exact detail, and exact JSON commands. Registry activation, external diagnostics, and complete definitions remain owned by `describe` and `extensions list`.

## Risks / Trade-offs

- **Breaking describe JSON shapes** → This is pre-alpha; document `--full --json` as the complete-snapshot migration path and lock all cardinalities with binary tests.
- **Readable schema renderer misses uncommon JSON Schema keywords** → Render common constraints explicitly and use deterministic local JSON fallback for unknown/composite fragments.
- **Agents do one additional command for detail** → Compact indexes expose exact IDs and print the detail command, while selected JSON avoids transferring unrelated schemas.
- **Source flags disappear from generic help** → Adapter detail remains registry-derived and discoverable through `describe adapter <id>`; the help pointer names that path.
