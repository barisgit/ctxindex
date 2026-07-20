# packages/adapters/src/builtin-documentation/

## Responsibility

Owns author-edited passive documentation sidecars for the Google, Microsoft, and local built-in Extension roots.

## Design and flow

Each child directory exports the pure `docs('./docs')` descriptor beside a conventional `docs/README.md`. Package staging resolves these directories through core's shared validator and embeds the resulting virtual trees.

## Integration

- Consumed by `packages/adapters/scripts/generate-documentation.ts` and the generated-tree freshness test.
- The runtime imports only `src/generated/documentation.ts`, never these filesystem paths.
