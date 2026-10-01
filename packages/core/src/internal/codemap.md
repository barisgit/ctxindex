# packages/core/src/internal/

## Responsibility

Contains private cross-capability implementation helpers that are not part of a package subpath.

## Design / flow

- `code-point-order.ts` exports `compareUnicodeCodePoints()`, a locale-independent comparator used where persisted or presented ordering must be deterministic; callers pass two strings and receive their Unicode code-point lexical order.
- `terminal-controls.ts` identifies terminal-active C0, DEL, C1, and standalone carriage-return characters while preserving ordinary Markdown tabs and line endings.

## Integration points

Consumed by deterministic ordering and passive text-validation boundaries across core. These helpers are intentionally absent from the public package export map.
