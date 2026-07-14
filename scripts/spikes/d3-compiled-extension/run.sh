#!/usr/bin/env bash
set -euo pipefail

fixture_dir="$(cd "$(dirname "$0")" && pwd)"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/ctxindex-d3.XXXXXX")"
trap 'rm -rf "$work_dir"' EXIT

mkdir -p "$work_dir/external/node_modules/spike-dep" "$work_dir/relocated"
cp "$fixture_dir/host.ts" "$work_dir/host.ts"
cp "$fixture_dir/external/"*.ts "$work_dir/external/"
cp "$fixture_dir/dependency/"* "$work_dir/external/node_modules/spike-dep/"

(
  cd "$work_dir"
  bun build --compile ./host.ts --outfile ./ctxindex-spike >/dev/null
)
cp "$work_dir/ctxindex-spike" "$work_dir/relocated/ctxindex-spike"

expected='{"id":"spike.extension","adapter":{"id":"spike.adapter","hostVersion":"spike-host-v1"},"probe":"typescript-runtime-dependency-ok"}'
actual="$(cd / && "$work_dir/relocated/ctxindex-spike" "$work_dir/external/extension.ts")"

if [[ "$actual" != "$expected" ]]; then
  printf 'Failed: expected %s, got %s\n' "$expected" "$actual" >&2
  exit 1
fi

printf 'Passed: Bun %s compiled binary loaded external TypeScript, its relative TypeScript import, and its own node_modules dependency after relocation.\n' "$(bun --version)"
