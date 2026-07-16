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
  --exclude-dir='e2e' \
  --exclude-dir='.git' \
  --exclude-dir='node_modules' \
  "https?://[^'\" )]+" \
  . \
  | grep -vE "($ALLOWLIST_PATTERN)" \
  | grep -vE "apps/cli/src/auth/google-loopback.ts:.*http://127\.0\.0\.1" \
  >> "$violations" || true

# fetch() is only allowed inside the single core egress chokepoint; every other
# caller (core auth, gmail adapter) routes through egressFetch.
grep -RInE \
  --include='*.ts' \
  --exclude='*.test.ts' \
  --exclude-dir='e2e' \
  --exclude-dir='.git' \
  --exclude-dir='node_modules' \
  "(^|[^.[:alnum:]_])fetch[[:space:]]*\(" \
  . \
  | grep -v "packages/core/src/net/index.ts" \
  >> "$violations" || true

# No direct node HTTP clients in runtime source.
grep -RInE \
  --include='*.ts' \
  --exclude='*.test.ts' \
  --exclude-dir='e2e' \
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

NODE_ENV=production bun test --path-ignore-patterns '__none__' ./packages/adapters/src/local-directory/sync.test.ts
NODE_ENV=production bun test --path-ignore-patterns '__none__' ./packages/core/src/net/index.test.ts
bun test --path-ignore-patterns '__none__' ./apps/cli/src/e2e/network-egress.e2e.test.ts

echo "VAL-NETWORK-EGRESS: static audit, production local no-egress, Gmail allowlist/rejection, and e2e passed"
