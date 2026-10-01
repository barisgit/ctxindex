## Capability Implementation Targets

- `search-routing` -> `openspec/specs/search-routing/implementation.md`

## Module Ownership

The thin CLI search command owns the empty-state rendering. Core search planning, the daemon RPC result shape, and the shared output module are unchanged; the shared pretty collection formatter keeps returning an empty string for zero rows so other commands are unaffected.

Authored Extension documentation in the official package owns the mailbox routing explanation. Its embedded copy remains generated from the authored tree.

## Interfaces and Data Flow

`formatSearchPretty(result, environment?)` returns `No results.` when `result.results` is empty and otherwise delegates to `formatPrettyCollection`. `printSearch` is the single sink for both direct and daemon results, so parity follows from the shared formatter without route-specific code. `formatSearchText`, `formatSearchJson`, and the refs projection are unchanged.

## Storage and State

Not applicable.

## Security and Compatibility

No egress, secrets, or schema changes. JSON, text, and refs bytes are unchanged, so agent and pipeline consumers are unaffected.

## Verification

Focused CLI search tests cover zero and nonzero results across pretty, text, refs, and JSON for both daemon and direct routes. The built-in documentation test pins the mailbox routing explanation and directory-versus-embedded equality.

## Promotion Notes

- Add to `openspec/specs/search-routing/implementation.md`: the search pretty formatter, not the shared collection formatter, owns the `No results.` empty state, and both routes render through the single CLI search printer.
