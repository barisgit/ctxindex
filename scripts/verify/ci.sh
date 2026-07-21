#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

PATH="$ROOT_DIR/node_modules/.bin:$PATH"
START_SECONDS="$SECONDS"

run_gate() {
  local gate="$1"
  shift

  printf '\nci: === %s ===\n' "$gate"
  printf 'ci: running %s: %s\n' "$gate" "$*"

  if "$@"; then
    printf 'PASS: %s\n' "$gate"
  else
    local exit_code=$?
    printf 'FAIL: %s (exit %s)\n' "$gate" "$exit_code" >&2
    exit "$exit_code"
  fi
}

install_dependencies() {
  local output_file
  output_file="$(mktemp)"

  if bun install --frozen-lockfile >"$output_file" 2>&1; then
    if ! grep -qi 'no changes' "$output_file"; then
      cat "$output_file"
    fi
    rm -f "$output_file"
    return 0
  fi

  local exit_code=$?
  cat "$output_file" >&2
  rm -f "$output_file"
  return "$exit_code"
}

run_gate install install_dependencies
run_gate lint biome check .
run_gate typecheck tsgo --noEmit -p tsconfig.base.json
run_gate build bun run build
run_gate package-dependencies bun run scripts/verify/package-dependencies.ts
run_gate architecture-lint bun run scripts/verify/architecture-lint.ts
run_gate cli-no-business-logic bun run scripts/verify/cli-no-business-logic.ts
run_gate cli-framework-citty bun run scripts/verify/cli-framework-citty.ts
run_gate cli-command-drift bun run scripts/verify/cli-command-drift.ts
run_gate cli-thin-lines bun run scripts/verify/cli-thin-lines.ts
run_gate cli-reference bun run check:cli-reference
run_gate exports-map bun run scripts/verify/exports-map.ts

run_gate full-test-suite bash scripts/verify/full-test-suite.sh

printf '\nci: all gates passed\n'
printf 'ci: total elapsed: %ss\n' "$((SECONDS - START_SECONDS))"
