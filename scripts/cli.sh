#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "${ROOT}/.ctxindex/worktree" ]]; then
  export CTXINDEX_CONFIG_HOME="${ROOT}/.ctxindex/config"
  export CTXINDEX_DATA_HOME="${ROOT}/.ctxindex/data"
  export CTXINDEX_STATE_HOME="${ROOT}/.ctxindex/state"
  export CTXINDEX_CACHE_HOME="${ROOT}/.ctxindex/cache"
  export XDG_CONFIG_HOME="${ROOT}/.ctxindex/config"
  export XDG_DATA_HOME="${ROOT}/.ctxindex/data"
  export XDG_STATE_HOME="${ROOT}/.ctxindex/state"
  export XDG_CACHE_HOME="${ROOT}/.ctxindex/cache"
fi

exec bun "${ROOT}/apps/cli/bin/ctxindex.mjs" "$@"
