# ctxindex instant demo: synthetic tenders

This is the official no-account ctxindex demo. It installs as an ordinary external Extension, creates eight complete synthetic procurement Resources through Sync, and supports full-text search, typed field filters, and `get`. It never contacts a provider, performs no network access or scraping, and needs no credentials, OAuth App, Account, secret, input file, or fixture preparation.

All organizations, references, descriptions, values, and dates are fictional test data. They do not represent, scrape, or imply affiliation with e-JN, eNaročanje, another procurement portal, or current tender opportunities.

## Five-minute walkthrough

Requirements: Bun 1.3.14 and an installed `ctxindex` CLI. Every command below uses isolated state, leaving your normal ctxindex configuration and data untouched.

```sh
CTXINDEX_DEMO_HOME="$(mktemp -d)"
export CTXINDEX_CONFIG_HOME="$CTXINDEX_DEMO_HOME/config"
export CTXINDEX_DATA_HOME="$CTXINDEX_DEMO_HOME/data"
export CTXINDEX_STATE_HOME="$CTXINDEX_DEMO_HOME/state"
export CTXINDEX_CACHE_HOME="$CTXINDEX_DEMO_HOME/cache"
printf 'Demo state: %s\n' "$CTXINDEX_DEMO_HOME"

ctxindex init
ctxindex extension install npm \
  '@ctxindex/demo-tenders@0.1.0' \
  ctxindex.demo
ctxindex realm add demo --name 'Instant demo'
ctxindex source add ctxindex.demo.tenders \
  --realm demo \
  --label demo-tenders
ctxindex sync --source demo-tenders
```

The install command is an explicit trust grant to acquire and run package code. ctxindex resolves the requested version to exact package bytes and starts from its immutable managed copy afterward.

`@ctxindex/demo-tenders` is not public yet. Publishing it and repeating the command anonymously are required launch Human checkpoints; until then, use the packed-artifact verification below rather than claiming the public command works.

Search the local index:

```sh
ctxindex search 'solar schools' --realm demo
ctxindex search --realm demo --kind ctxindex.demo.tender \
  --field status=open \
  --field category='cybersecurity services'
```

Copy a returned `ctx://...` Ref and retrieve the complete Resource:

```sh
ctxindex get 'ctx://<source-id>/tender/DEMO-2026-001'
```

For an agent-safe deterministic document, add `--json` to any command. See [expected-output.md](expected-output.md) for website-ready representative output and [the Extension documentation](docs/README.md) for the data contract and troubleshooting.

## Reset

The demo exists only below `$CTXINDEX_DEMO_HOME`. When finished, start a new shell or unset the four `CTXINDEX_*_HOME` variables. Remove the printed temporary directory only if you no longer need its demo state.

## Development

The human-authored source is [`extension.ts`](extension.ts). `demo-extension.js` is the checked self-contained package entry; regenerate it with:

```sh
bun run --cwd examples/tenders-extension build
bun test examples/tenders-extension/extension.test.ts
```

The bundle embeds authoring runtime dependencies so installing this package does not depend on separately publishing `@ctxindex/extension-sdk`. The Extension still passes through the same manifest resolver, structural collector, documentation validator, exact-id selector, and complete-registry validation as any external package.

Build the exact local tarball and inspect its eight allowlisted files:

```sh
bun pm pack --destination /tmp
tar -tzf /tmp/ctxindex-demo-tenders-0.1.0.tgz
```

The automated package smoke serves that exact tarball from an isolated loopback npm registry, installs it with the generic npm lifecycle, and runs the same Source, Sync, search, and `get` flow. Anonymous npm acquisition remains blocked until the package is published.
