#!/usr/bin/env bash
# Darwin retained-lease and compiled daemon gates.
#
# A human runs this once on a Mac from a fresh clone or after `git pull`:
#
#   bash scripts/verify/darwin-daemon-gates.sh
#
# It uses Bun 1.3.14 (installing it into a temporary directory when the bun on
# PATH differs, without touching any global install or shell profile), installs
# dependencies from the lockfile, runs every gate below with isolated temporary
# XDG/CTXINDEX_* homes, and prints a PASSED/FAILED summary. The exit code is 0
# only when every gate passes.
set -uo pipefail

readonly BUN_VERSION=1.3.14

# One gate per entry: "label|working directory|command". Later slices append
# their Darwin gates here. Commands mirror the package test/test:e2e scripts.
readonly GATES=(
  "Darwin lease unit suite|packages/local-daemon|NODE_ENV=test CTXINDEX_KEYTAR_MOCK_FILE=.turbo/keytar-unit.json bun test src/lease.test.ts"
  "Daemon runtime lease suite|apps/daemon|NODE_ENV=test CTXINDEX_KEYTAR_MOCK_FILE=.turbo/keytar-unit.json bun test src/runtime-lease.test.ts"
  "Compiled lease suite|apps/daemon|NODE_ENV=test CTXINDEX_KEYTAR_MOCK_FILE=.turbo/keytar-e2e.json bun run ../../scripts/with-timeout.ts 300 -- bun test --path-ignore-patterns '__none__' src/e2e/compiled-lease.e2e.test.ts"
  "Darwin compiled daemon journeys|apps/daemon|NODE_ENV=test CTXINDEX_KEYTAR_MOCK_FILE=.turbo/keytar-e2e.json bun run ../../scripts/with-timeout.ts 300 -- bun test --path-ignore-patterns '__none__' src/e2e/compiled-daemon.e2e.test.ts"
  "Compiled Extension registry journeys|apps/daemon|NODE_ENV=test CTXINDEX_KEYTAR_MOCK_FILE=.turbo/keytar-e2e.json bun run ../../scripts/with-timeout.ts 300 -- bun test --path-ignore-patterns '__none__' src/e2e/compiled-extension-registry.e2e.test.ts"
  "Compiled daemon ownership journey|apps/cli|NODE_ENV=test CTXINDEX_KEYTAR_MOCK_FILE=.turbo/keytar-e2e.json bun run ../../scripts/with-timeout.ts 300 -- bun test --path-ignore-patterns '__none__' src/e2e/compiled-daemon-ownership.e2e.test.ts"
  "Compiled Action and Artifact journey|apps/cli|NODE_ENV=test CTXINDEX_KEYTAR_MOCK_FILE=.turbo/keytar-e2e.json bun run ../../scripts/with-timeout.ts 300 -- bun test --path-ignore-patterns '__none__' src/e2e/compiled-daemon-action-artifact.e2e.test.ts"
  "Compiled OAuth Account journey|apps/cli|NODE_ENV=test CTXINDEX_KEYTAR_MOCK_FILE=.turbo/keytar-e2e.json bun run ../../scripts/with-timeout.ts 300 -- bun test --path-ignore-patterns '__none__' src/e2e/compiled-oauth-account-lifecycle.e2e.test.ts"
)

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "darwin-daemon-gates: these gates verify macOS retained-lease behavior; run this script on a Mac (detected $(uname -s))." >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

# A short /tmp root keeps daemon Unix socket paths within the macOS limit.
WORK_ROOT="$(mktemp -d /tmp/ctxd-gates.XXXXXX)"
trap 'rm -rf "$WORK_ROOT"' EXIT

ensure_bun() {
  if command -v bun >/dev/null 2>&1 && [[ "$(bun --version)" == "$BUN_VERSION" ]]; then
    return 0
  fi

  echo "Installing Bun $BUN_VERSION into a temporary directory..."
  local bun_root="$WORK_ROOT/bun"
  # A minimal environment (no bun on PATH, a non-interactive SHELL) keeps the
  # official installer from adding completions or editing shell profiles.
  if ! curl -fsSL https://bun.sh/install |
    env -i HOME="$HOME" PATH=/usr/bin:/bin SHELL=/bin/sh BUN_INSTALL="$bun_root" \
      bash -s "bun-v$BUN_VERSION"; then
    echo "darwin-daemon-gates: failed to install Bun $BUN_VERSION" >&2
    return 1
  fi
  export PATH="$bun_root/bin:$PATH"
  [[ "$(bun --version)" == "$BUN_VERSION" ]]
}

if ! ensure_bun; then
  echo "darwin-daemon-gates: Bun $BUN_VERSION is required" >&2
  exit 1
fi

if ! bun install --frozen-lockfile; then
  echo "darwin-daemon-gates: bun install --frozen-lockfile failed" >&2
  exit 1
fi

# Isolated homes: no gate may read or write the user's real ctxindex state.
for name in config data state cache; do
  mkdir -m 700 "$WORK_ROOT/$name"
done
mkdir -m 700 "$WORK_ROOT/runtime"
export XDG_CONFIG_HOME="$WORK_ROOT/config"
export XDG_DATA_HOME="$WORK_ROOT/data"
export XDG_STATE_HOME="$WORK_ROOT/state"
export XDG_CACHE_HOME="$WORK_ROOT/cache"
export CTXINDEX_CONFIG_HOME="$WORK_ROOT/config/ctxindex"
export CTXINDEX_DATA_HOME="$WORK_ROOT/data/ctxindex"
export CTXINDEX_STATE_HOME="$WORK_ROOT/state/ctxindex"
export CTXINDEX_CACHE_HOME="$WORK_ROOT/cache/ctxindex"
export CTXINDEX_DAEMON_RUNTIME_ROOT="$WORK_ROOT/runtime"

results=()
overall=0
for gate in "${GATES[@]}"; do
  IFS='|' read -r label directory command <<<"$gate"
  echo
  echo "=== $label ($directory: $command)"
  if (cd "$REPO_ROOT/$directory" && bash -c "$command"); then
    results+=("$label|PASSED")
  else
    results+=("$label|FAILED")
    overall=1
  fi
done

echo
echo "Darwin daemon gates: commit $(git rev-parse --short HEAD 2>/dev/null || echo unknown), macOS $(sw_vers -productVersion 2>/dev/null || echo unknown) $(uname -m), Bun $(bun --version)"
printf '%-40s %s\n' "Gate" "Result"
for result in "${results[@]}"; do
  IFS='|' read -r label status <<<"$result"
  printf '%-40s %s\n' "$label" "$status"
done
if [[ "$overall" -eq 0 ]]; then
  echo "Overall: PASSED"
else
  echo "Overall: FAILED"
fi
exit "$overall"
