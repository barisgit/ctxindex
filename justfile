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

# Refresh release evidence logs under docs/release/run-logs
release-checks:
    #!/usr/bin/env bash
    set -u
    commands=(
      "bun run typecheck"
      "bun run lint"
      "bun test"
      "bun run test:e2e"
      "bun run test:integration"
      "bash scripts/verify/ci.sh"
      "bash scripts/verify/cli.sh"
      "bun run scripts/verify/env-loader.ts"
      "bash scripts/verify/network-egress.sh"
      "bun run scripts/verify/no-prompts-static.ts"
    )
    log_dir="docs/release/run-logs"
    mkdir -p "$log_dir"
    : > "$log_dir/summary.tsv"
    idx=0
    for cmd in "${commands[@]}"; do
      idx=$((idx+1))
      slug=$(printf '%02d-%s' "$idx" "$cmd" | tr ' /:' '---' | tr -cd '[:alnum:]._-' | sed 's/--*/-/g')
      log="$log_dir/${slug}.log"
      echo "### $cmd"
      echo "log=$log"
      start=$(date +%s)
      set +e
      bash -lc "$cmd" >"$log" 2>&1
      code=$?
      set -e
      end=$(date +%s)
      printf '%s\t%s\t%s\t%s\n' "$cmd" "$code" "$((end-start))" "$log" >> "$log_dir/summary.tsv"
      echo "exit=$code seconds=$((end-start))"
      tail -20 "$log" | sed 's/^/TAIL: /'
      echo
      if [ "$code" -ne 0 ]; then
        echo "Command failed; continuing to capture remaining required checks." >&2
      fi
    done

# Architecture/structure gates
architecture-lint:
    bun run scripts/verify/architecture-lint.ts

cli-no-business-logic:
    bun run scripts/verify/cli-no-business-logic.ts

cli-framework-citty:
    bun run scripts/verify/cli-framework-citty.ts

cli-thin-lines:
    bun run scripts/verify/cli-thin-lines.ts

exports-map:
    bun run scripts/verify/exports-map.ts

no-prompts-static:
    bun run scripts/verify/no-prompts-static.ts

env-loader:
    bun run scripts/verify/env-loader.ts

cli *args:
    bun apps/cli/bin/ctxindex.mjs {{args}}

cli-help:
    bash scripts/verify/cli.sh

network-egress:
    bash scripts/verify/network-egress.sh
