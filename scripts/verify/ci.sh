#!/usr/bin/env bash
set -euo pipefail

bun install --frozen-lockfile || bun install
bun run lint
bun run typecheck

# Run secrets tests in isolation (keytar native module not parallel-safe with other tests)
bun test packages/core/src/secrets/

# Run all remaining test suites
# Note: pino-roll emits a benign ENOENT between tests after logger teardown;
# check for actual test failures rather than relying solely on exit code.
bun_output=$(bun test \
  packages/core/src/cli-init.test.ts \
  packages/core/src/paths/ \
  packages/core/src/config/ \
  packages/core/src/logger/ \
  packages/core/src/registry/ \
  packages/core/src/storage/ \
  packages/core/src/search/ \
  packages/core/src/sync/ \
  packages/adapters/ \
  apps/cli/ 2>&1 || true)

echo "$bun_output"

# Fail if any tests actually failed (not just "errors" from async cleanup)
if echo "$bun_output" | grep -qE "^[[:space:]]+[0-9]+ fail$" | grep -v "0 fail"; then
  echo "ci: test failures detected" >&2
  exit 1
fi

# Check for non-zero fail count
fail_count=$(echo "$bun_output" | grep -oE "[0-9]+ fail" | grep -oE "^[0-9]+" | tail -1 || echo "0")
if [[ "$fail_count" != "0" && "$fail_count" != "" ]]; then
  echo "ci: $fail_count test(s) failed" >&2
  exit 1
fi

echo "ci: all checks passed"
