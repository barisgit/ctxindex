#!/usr/bin/env bash
set -euo pipefail

bun test \
  packages/core/src/registry/registry-core.test.ts \
  packages/adapters/src/registry.contract.test.ts

forbidden_matches="$(mktemp)"
trap 'rm -f "$forbidden_matches"' EXIT

grep -RInE \
  --include='*.ts' \
  --exclude='*.test.ts' \
  --exclude-dir='.git' \
  --exclude-dir='node_modules' \
  --exclude-dir='migrations' \
  "Object\.values\([A-Za-z_]+_?[Aa]dapter|\.adapters\[['\"]" \
  . \
  | grep -v '^./packages/core/src/registry/' \
  > "$forbidden_matches" || true

if [[ -s "$forbidden_matches" ]]; then
  echo 'Forbidden adapter registry access patterns found:' >&2
  cat "$forbidden_matches" >&2
  exit 1
fi
