#!/usr/bin/env bash
# VAL-NETWORK-EGRESS: static + runtime audit for provider network egress.
set -euo pipefail

ALLOWLIST=(
  "oauth2.googleapis.com"
  "accounts.google.com"
  "gmail.googleapis.com"
  "www.googleapis.com"
)

ALLOWLIST_PATTERN=$(IFS='|'; echo "${ALLOWLIST[*]}")
violations="$(mktemp)"
trap 'rm -f "$violations"' EXIT

# Any literal HTTP(S) URL in source must target an allowlisted host.
grep -RInE \
  --include='*.ts' \
  --exclude='*.test.ts' \
  --exclude-dir='.git' \
  --exclude-dir='node_modules' \
  "https?://[^'\" )]+" \
  . \
  | grep -vE "($ALLOWLIST_PATTERN)" \
  >> "$violations" || true

# fetch() is only allowed inside the safeFetch implementation; callers use safeFetch.
grep -RInE \
  --include='*.ts' \
  --exclude='*.test.ts' \
  --exclude-dir='.git' \
  --exclude-dir='node_modules' \
  "\bfetch\s*\(" \
  . \
  | grep -v "packages/adapters/src/google-mailbox/api.ts" \
  >> "$violations" || true

# No direct node HTTP clients in runtime source.
grep -RInE \
  --include='*.ts' \
  --exclude='*.test.ts' \
  --exclude-dir='.git' \
  --exclude-dir='node_modules' \
  "\b(https?|node:https?|node:http)\.(request|get)\s*\(" \
  . \
  >> "$violations" || true

if [[ -s "$violations" ]]; then
  echo "VAL-NETWORK-EGRESS FAIL: non-allowlisted or bypassing network egress:" >&2
  cat "$violations" >&2
  exit 1
fi

bun test packages/adapters/src/network-egress.integration.test.ts

echo "VAL-NETWORK-EGRESS: static audit and runtime interceptor passed"
