# packages/core/src/export/

## Responsibility

Application service for exporting one locally available or provider-retrieved Resource as deterministic JSON or a Profile-declared format.

## Design/patterns

- `exportSourceResource()` in `export-service.ts` composes Source retrieval with Profile-owned serialization, keeping format behavior out of CLI/adapters.
- JSON is a universal built-in format; `stableJsonValue()` recursively sorts object keys and omits undefined entries for deterministic bytes.
- `UnsupportedExportFormatError` carries valid formats and profile identity; `ExportDataIntegrityError` distinguishes unavailable/invalid profile data or renderer output.
- `index.ts` is the leaf barrel.

## Data & control flow

1. `exportSourceResource()` forwards retrieval inputs to `getSourceResource()` and receives a Resource plus warnings.
2. It resolves the exact Profile version, builds the sorted format set (`json` plus `profile.exports`), requires a hydrated payload, and revalidates that payload with the Profile schema.
3. JSON passes through `stableJsonValue()` and `TextEncoder`; custom formats call `profile.exports[format].render()` and normalize strings to UTF-8 bytes.
4. The result returns bytes, media type, format, Ref, and retrieval warnings.

## Integration points

- Retrieval boundary: `packages/core/src/source/retrieve.ts` via `getSourceResource()` and `RetrieveSourceResourceInput`.
- Export declarations and profile references: `@ctxindex/extension-sdk` through `input.registry.profiles`.
- Error contract: `packages/core/src/errors.ts`.
- Public export: `packages/core/src/export/index.ts`.
