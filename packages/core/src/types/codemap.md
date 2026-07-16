# packages/core/src/types/

## Responsibility

Supplies ambient TypeScript declarations for runtime modules/assets that lack project-local type information.

## Design/patterns

- `pino-roll.d.ts` uses module augmentation/declaration to type the package's async default factory, rotation options, and writable stream with optional `file`/`flush` capabilities.
- `sql.d.ts` declares `*.sql` imports as default-exported strings, keeping raw SQL asset loading type-safe without a per-file declaration.
- Both files are compile-time adapters only and emit no runtime JavaScript.

## Data & control flow

- TypeScript resolves `import pinoRoll from 'pino-roll'` to `PinoRollOptions`, `PinoRollStream`, and the declared factory signature.
- TypeScript resolves any `import sql from './file.sql'` to a `string`; the configured runtime/bundler remains responsible for loading the asset.

## Integration points

- `pino-roll.d.ts` integrates Node's `Writable` type with the external `pino-roll` package used by core logging.
- `sql.d.ts` is available to production modules that import SQL migration/assets.
- These declarations are discovered by the core package TypeScript build and have no barrel export or runtime dependencies.
