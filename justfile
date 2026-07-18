set positional-arguments := true

default:
    @just --list

# Install deps + run all gates
ci:
    bash scripts/verify/ci.sh

# Bun + biome + tsgo
install:
    bun install --frozen-lockfile

build:
    bun run build

lint:
    bun run lint

typecheck:
    bun run typecheck

test:
    bun test

test-integration:
    bun run test:integration

test-e2e:
    bun run test:e2e

full-test-suite:
    bash scripts/verify/full-test-suite.sh

cli *args:
    bun apps/cli/bin/ctxindex.mjs {{args}}

cli-help:
    bash scripts/verify/cli.sh

network-egress:
    bash scripts/verify/network-egress.sh
