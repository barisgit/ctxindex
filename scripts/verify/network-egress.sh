#!/usr/bin/env bash
# VAL-NETWORK-EGRESS: static + runtime audit for provider network egress.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

ALLOWLIST=(
  "oauth2.googleapis.com"
  "accounts.google.com"
  "openidconnect.googleapis.com"
  "gmail.googleapis.com"
  "www.googleapis.com"
  "login.microsoftonline.com"
  "graph.microsoft.com"
)

ALLOWLIST_PATTERN=$(IFS='|'; echo "${ALLOWLIST[*]}")
PRODUCTION_RUNTIME_ROOTS=(
  "packages/core/src"
  "packages/official/src"
  "apps/cli/src"
)
for scan_root in "${PRODUCTION_RUNTIME_ROOTS[@]}"; do
  if [[ ! -d "$scan_root" ]]; then
    echo "VAL-NETWORK-EGRESS FAIL: production scan root is missing: $scan_root" >&2
    exit 1
  fi
done
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
  "${PRODUCTION_RUNTIME_ROOTS[@]}" \
  | grep -vE "($ALLOWLIST_PATTERN)" \
  | grep -vE "packages/core/src/auth/loopback.ts:.*http://localhost" \
  | grep -vF "packages/core/src/auth/test-provider.ts:" \
  | grep -vF "apps/cli/src/daemon/client.ts:" \
  >> "$violations" || true

# fetch() is only allowed inside the single core egress chokepoint; every other
# caller (core auth and provider Adapters) routes through egressFetch.
grep -RInE \
  --include='*.ts' \
  --exclude='*.test.ts' \
  --exclude-dir='e2e' \
  --exclude-dir='.git' \
  --exclude-dir='node_modules' \
  "(^|[^.[:alnum:]_])fetch[[:space:]]*\(" \
  "${PRODUCTION_RUNTIME_ROOTS[@]}" \
  | grep -v "packages/core/src/net/index.ts" \
  | grep -vF "apps/cli/src/daemon/client.ts:" \
  >> "$violations" || true

# Alternate browser/Bun clients must not become a second egress path. Type-only
# references in tests are excluded with the rest of the test surface above.
grep -RInE \
  --include='*.ts' \
  --exclude='*.test.ts' \
  --exclude-dir='e2e' \
  --exclude-dir='.git' \
  --exclude-dir='node_modules' \
  "(globalThis|Bun)\.fetch[[:space:]]*\(|new[[:space:]]+(XMLHttpRequest|WebSocket)[[:space:]]*\(|from[[:space:]]+['\"]undici['\"]|require[[:space:]]*\([[:space:]]*['\"]undici['\"]" \
  "${PRODUCTION_RUNTIME_ROOTS[@]}" \
  >> "$violations" || true

# No direct node HTTP clients in runtime source.
grep -RInE \
  --include='*.ts' \
  --exclude='*.test.ts' \
  --exclude-dir='e2e' \
  --exclude-dir='.git' \
  --exclude-dir='node_modules' \
  "\b(https?|node:https?|node:http)\.(request|get)\s*\(" \
  "${PRODUCTION_RUNTIME_ROOTS[@]}" \
  >> "$violations" || true

# Every production Adapter module that performs provider I/O must have a
# co-located focused test. This is discovery-based so a newly added request
# helper cannot silently fall outside the provider egress test surface.
while IFS= read -r request_source; do
  request_stem="$(basename "${request_source%.ts}")"
  request_directory="$(dirname "$request_source")"
  if ! find "$request_directory" -maxdepth 1 -type f \
    -name "${request_stem}*.test.ts" -print -quit | grep -q .; then
    echo "$request_source: provider request module has no co-located ${request_stem}*.test.ts" \
      >> "$violations"
  fi
done < <(
  grep -RlE \
    --include='*.ts' \
    --exclude='*.test.ts' \
    --exclude-dir='.git' \
    --exclude-dir='node_modules' \
    'context\.fetch[[:space:]]*\(' \
    packages/official/src \
    | sort
)

# Test-only endpoint overrides have a deliberately tiny production ownership
# surface. Their focused tests prove production ignores them and nonproduction
# accepts loopback hosts only.
expected_mock_owners="$(cat <<'EOF'
apps/cli/src/account/handle-account-command.ts
apps/daemon/src/runtime.ts
packages/core/src/auth/oauth-endpoints.ts
packages/core/src/config/env-loader.ts
packages/official/src/google-calendar/url.ts
packages/official/src/google-mailbox/url.ts
packages/official/src/microsoft/transport.ts
EOF
)"
actual_mock_owners="$({
  grep -RlE \
    --include='*.ts' \
    --exclude='*.test.ts' \
    --exclude-dir='e2e' \
    --exclude-dir='.git' \
    --exclude-dir='node_modules' \
    'CTXINDEX_[A-Z_]+_MOCK_BASE_URL' \
    packages apps 2>/dev/null || true
} | sort)"
if [[ "$actual_mock_owners" != "$expected_mock_owners" ]]; then
  echo 'production mock endpoint ownership drifted:' >> "$violations"
  diff -u <(printf '%s\n' "$expected_mock_owners") \
    <(printf '%s\n' "$actual_mock_owners") >> "$violations" || true
fi

if [[ -s "$violations" ]]; then
  echo "VAL-NETWORK-EGRESS FAIL: non-allowlisted or bypassing network egress:" >&2
  cat "$violations" >&2
  exit 1
fi

echo "VAL-NETWORK-EGRESS: provider request discovery, host ownership, and direct-client audit passed"
