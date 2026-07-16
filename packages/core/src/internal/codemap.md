# packages/core/src/internal/

## Responsibility

Contains private cross-capability implementation helpers that are not part of a package subpath.

## Design / flow

- `code-point-order.ts` exports `compareUnicodeCodePoints()`, a locale-independent comparator used where persisted or presented ordering must be deterministic.
- Callers pass two strings and receive their Unicode code-point lexical order; the module owns no state or I/O.

## Integration points

Consumed by Account inventory/scope normalization, OAuth scope selection, and registry semantic comparison. It is intentionally absent from the public package export map.
