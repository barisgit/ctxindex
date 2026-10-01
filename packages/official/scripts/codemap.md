# packages/official/scripts/

## Responsibility

Stages built-in Extension documentation from source sidecar directories into portable virtual trees for compiled distribution.

## Design and flow

- `generate-documentation.ts` binds each pure `docs('./docs')` descriptor to its descriptor module URL and invokes core's shared resolver.
- It serializes the already validated Markdown strings and copied image bytes into `src/generated/documentation.ts`; it performs no acquisition or runtime loading.

## Integration

- Invoked by `bun run generate:documentation` in `packages/official/package.json`.
- Source declarations live under `src/builtin-documentation/`; generated values are consumed by `src/builtins.ts`.
