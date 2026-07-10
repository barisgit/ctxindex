# ctxindex

ctxindex is a Bun/TypeScript local indexing CLI for syncing configured sources into a SQLite-backed search index, with bundled adapters and skills planned for v1.

## Quickstart

```sh
bun install
bun cli --help            # from repo root
# or, equivalently:
bun run cli --help        # from repo root or from apps/cli
```

There is no `bun link` / global install path. The CLI is invoked only through `bun cli` / `bun run cli`, both of which dispatch to `apps/cli/bin/ctxindex.mjs`.
