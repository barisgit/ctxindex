#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
tmp_dir=$(mktemp -d)
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

(
  cd "$repo_root"
  bun link
)

(
  cd "$tmp_dir"
  bun init -y >/dev/null
  if ! bun link ctxindex >/dev/null 2>&1; then
    bun link ctxindex-root
  fi

  export PATH="$tmp_dir/node_modules/.bin:$PATH"

  ctxindex --version
  help_output=$(ctxindex --help)
  printf '%s\n' "$help_output"

  for command in init auth realm source sync search status secrets skills; do
    if ! grep -Fq "$command" <<<"$help_output"; then
      printf 'missing command in help output: %s\n' "$command" >&2
      exit 1
    fi
  done
)
