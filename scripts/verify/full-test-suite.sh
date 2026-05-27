#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

output_file="$(mktemp)"
trap 'rm -f "$output_file"' EXIT

if bun test --path-ignore-patterns '__none__' --max-concurrency=1 >"$output_file" 2>&1; then
  bun_exit=0
else
  bun_exit=$?
fi

cat "$output_file"

pass_line="$(grep -E '^ [0-9]+ pass$' "$output_file" | tail -n 1 || true)"
fail_line="$(grep -E '^ [0-9]+ fail$' "$output_file" | tail -n 1 || true)"
pass_count="$(awk '{print $1}' <<<"$pass_line")"
fail_count="$(awk '{print $1}' <<<"$fail_line")"

if [[ -z "$pass_count" || -z "$fail_count" ]]; then
  echo 'could not parse bun test output' >&2
  exit 1
fi

if (( bun_exit != 0 )); then
  echo "bun test failed with exit code $bun_exit" >&2
  exit "$bun_exit"
fi

if (( pass_count < 109 )); then
  echo "full-test-suite: expected at least 109 pass, got $pass_count" >&2
  exit 1
fi

if (( fail_count != 0 )); then
  echo "full-test-suite: expected 0 fail, got $fail_count" >&2
  exit 1
fi

required_paths=(
  'packages/core/src/sync/lock-recovery.test.ts'
  'packages/core/src/sync/exit-codes.test.ts'
)

if [[ -f 'packages/adapters/src/google-mailbox/sync.integration.test.ts' ]]; then
  required_paths+=(
    'packages/adapters/src/google-mailbox/sync.integration.test.ts'
  )
else
  found_google_tests=0
  while IFS= read -r path; do
    required_paths+=("$path")
    found_google_tests=1
  done < <(find packages/adapters/src/google-mailbox -type f -name '*test.ts' | sort)

  if (( found_google_tests == 0 )); then
    echo 'full-test-suite: missing required google-mailbox tests' >&2
    exit 1
  fi
fi

found_cli_e2e=0
while IFS= read -r path; do
  required_paths+=("$path")
  found_cli_e2e=1
done < <(find apps/cli/src/e2e -type f -name '*.test.ts' | sort)

if (( found_cli_e2e == 0 )); then
  echo 'full-test-suite: missing required apps/cli/src/e2e/ tests' >&2
  exit 1
fi

missing_paths=()
for path in "${required_paths[@]}"; do
  if ! grep -Fq "$path" "$output_file"; then
    missing_paths+=("$path")
  fi
done

if (( ${#missing_paths[@]} > 0 )); then
  echo 'full-test-suite: missing required test paths in bun test output:' >&2
  printf '  %s\n' "${missing_paths[@]}" >&2
  exit 1
fi

echo "full-test-suite: PASS ($pass_count pass / 0 fail)"
