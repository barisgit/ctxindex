#!/usr/bin/env bash
set -u
commands=(
  "bun run typecheck"
  "bun run lint"
  "bun test"
  "bun run test:e2e"
  "bun run test:integration"
  "bash scripts/verify/ci.sh"
  "bash scripts/verify/bun-link.sh"
  "bash scripts/verify/env-loader.sh"
  "bash scripts/verify/network-egress.sh"
  "bash scripts/verify/no-prompts-static.sh"
)
idx=0
: > docs/RELEASE-V1/run-logs/summary.tsv
for cmd in "${commands[@]}"; do
  idx=$((idx+1))
  slug=$(printf '%02d-%s' "$idx" "$cmd" | tr ' /:' '---' | tr -cd '[:alnum:]._-' | sed 's/--*/-/g')
  log="docs/RELEASE-V1/run-logs/${slug}.log"
  echo "### $cmd"
  echo "log=$log"
  start=$(date +%s)
  set +e
  bash -lc "$cmd" >"$log" 2>&1
  code=$?
  set -e
  end=$(date +%s)
  printf '%s\t%s\t%s\t%s\n' "$cmd" "$code" "$((end-start))" "$log" >> docs/RELEASE-V1/run-logs/summary.tsv
  echo "exit=$code seconds=$((end-start))"
  tail -20 "$log" | sed 's/^/TAIL: /'
  echo
  if [ "$code" -ne 0 ]; then
    echo "Command failed; continuing to capture remaining required checks." >&2
  fi
done
