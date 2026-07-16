# packages/core/src/ref/

## Responsibility

Validates and decomposes canonical `ctx://` resource references into source identity and provider-defined suffix components.

## Design

- `parseRef()` is the single parser/validator and returns immutable `ParsedRef` data.
- `REF_PATTERN` requires a 26-character Crockford-style ULID source ID and a non-empty URI-safe suffix with uppercase percent escapes.
- Suffixes are capped at 16 KiB by UTF-8 byte length.
- All malformed inputs collapse to `CtxindexValidationError('invalid_ref')`.

## Data & control flow

A reference string enters `parseRef()`, is matched against `REF_PATTERN`, and has its suffix byte length checked. Valid input returns `{ sourceId, suffix, ref }`; invalid input throws before downstream storage or provider work.

## Integration points

- Re-exported by `packages/core/src/index.ts`.
- Used at action, artifact, relation, resource, source retrieval, sync, and thread boundaries: notably `packages/core/src/action/run.ts`, `packages/core/src/artifact/`, `packages/core/src/source/retrieve.ts`, and `packages/core/src/sync/sync-coordinator.ts`.
- Depends only on `packages/core/src/errors.ts`; consumers own source lookup and suffix interpretation.
