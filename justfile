set positional-arguments := true

default:
    @just --list

# Install deps + run all gates
ci:
    bun run ci

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
    bun run test

test-integration:
    bun run test:integration

test-e2e:
    bun run test:e2e

cli *args:
    bun apps/cli/bin/ctxindex.mjs {{args}}

cli-help:
    bash scripts/verify/cli.sh

network-egress:
    bash scripts/verify/network-egress.sh
