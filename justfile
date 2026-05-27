set positional-arguments := true

default:
    @just --list

# Install deps + run all gates
ci:
    bash scripts/verify/ci.sh

# Bun + biome + tsgo
install:
    bun install

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

# Architecture/structure gates
architecture-lint:
    bun run scripts/verify/architecture-lint.ts

cli-no-business-logic:
    bun run scripts/verify/cli-no-business-logic.ts

cli-framework-citty:
    bun run scripts/verify/cli-framework-citty.ts

cli-thin-lines:
    bun run scripts/verify/cli-thin-lines.ts apps/cli/src/commands/auth.ts apps/cli/src/commands/sync.ts apps/cli/src/commands/realm.ts apps/cli/src/commands/source.ts apps/cli/src/commands/search.ts apps/cli/src/commands/status.ts apps/cli/src/commands/secrets.ts apps/cli/src/commands/skills.ts apps/cli/src/commands/init.ts

exports-map:
    bun run scripts/verify/exports-map.ts

no-prompts-static:
    bun run scripts/verify/no-prompts-static.ts

env-loader:
    bun run scripts/verify/env-loader.ts

bun-link:
    bash scripts/verify/bun-link.sh

live-gmail-sync:
    bash scripts/verify/live-gmail-sync.sh

network-egress:
    bash scripts/verify/network-egress.sh

# Link/unlink (delegates to apps/cli workspace)
link:
    bun --filter @ctxindex/cli link

unlink:
    bun --filter @ctxindex/cli unlink
