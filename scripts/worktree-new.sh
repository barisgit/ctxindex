#!/usr/bin/env bash
set -euo pipefail

# scripts/worktree-new.sh — create a repo-local git worktree for ctxindex.
#
# Usage:
#   ./scripts/worktree-new.sh [--existing] <type/name>
#
# Modes:
#   (default)    Create a new branch <type/name> and worktree at .worktrees/<type-name>.
#   --existing   Attach to an existing branch (local or remote-tracking).
#
# Branch must be typed: <type>/<name>. Allowed types:
#   feature, fix, docs, chore

usage() {
  cat >&2 <<EOF
Usage: $0 [--existing] <type/name>
  Types: feature, fix, docs, chore
  Example: $0 feature/v1-impl
EOF
}

is_valid_branch_type() {
  case "$1" in
    feature|fix|docs|chore) return 0 ;;
    *) return 1 ;;
  esac
}

ref_supports_worktree_isolation() {
  local ref="$1"
  local package_json
  local cli_command
  local workspace_package_json
  local workspace_cli_command
  local launcher
  local required

  package_json="$(git show "${ref}:package.json" 2>/dev/null)" || return 1
  cli_command="$(
    bun -e 'process.stdout.write(JSON.parse(process.argv[1]).scripts?.cli ?? "")' \
      "$package_json" 2>/dev/null
  )" || return 1
  [[ "$cli_command" == "bash scripts/cli.sh" ]] || return 1

  workspace_package_json="$(git show "${ref}:apps/cli/package.json" 2>/dev/null)" || return 1
  workspace_cli_command="$(
    bun -e 'process.stdout.write(JSON.parse(process.argv[1]).scripts?.cli ?? "")' \
      "$workspace_package_json" 2>/dev/null
  )" || return 1
  [[ "$workspace_cli_command" == "bash ../../scripts/cli.sh" ]] || return 1

  launcher="$(git show "${ref}:scripts/cli.sh" 2>/dev/null)" || return 1
  for required in \
    '.ctxindex/worktree' \
    'CTXINDEX_CONFIG_HOME=' \
    'CTXINDEX_DATA_HOME=' \
    'CTXINDEX_STATE_HOME=' \
    'CTXINDEX_CACHE_HOME=' \
    'XDG_CONFIG_HOME=' \
    'XDG_DATA_HOME=' \
    'XDG_STATE_HOME=' \
    'XDG_CACHE_HOME=' \
    'apps/cli/bin/ctxindex.mjs'; do
    [[ "$launcher" == *"$required"* ]] || return 1
  done
}

require_worktree_isolation() {
  local ref="$1"

  if ! ref_supports_worktree_isolation "$ref"; then
    echo "error: branch '$BRANCH' lacks marker-aware CLI wiring" >&2
    echo "expected both package CLI scripts and scripts/cli.sh to support worktree isolation" >&2
    exit 1
  fi
}

MODE="new"
if [[ "${1:-}" == "--existing" ]]; then
  MODE="existing"
  shift
fi

if [[ -z "${1:-}" ]]; then
  usage
  exit 1
fi

BRANCH="$1"
TYPE="${BRANCH%%/*}"

case "$BRANCH" in
  */) usage; exit 1 ;;
  -*) usage; exit 1 ;;
  *..*) usage; exit 1 ;;
  *//*) usage; exit 1 ;;
  /*) usage; exit 1 ;;
esac

if [[ "$BRANCH" != */* ]]; then
  echo "error: branch must be typed as <type>/<name>" >&2
  usage
  exit 1
fi

if ! is_valid_branch_type "$TYPE"; then
  echo "error: unknown branch type '$TYPE'" >&2
  usage
  exit 1
elif [[ ! "$BRANCH" =~ ^[a-z]+/[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
  echo "error: unsafe branch name '$BRANCH'" >&2
  usage
  exit 1
fi

ROOT="$(git rev-parse --show-toplevel)"
DIR_NAME="${BRANCH//\//-}"
WORKTREE_DIR="${ROOT}/.worktrees/${DIR_NAME}"

if [[ -d "$WORKTREE_DIR" ]]; then
  echo "error: worktree already exists at ${WORKTREE_DIR}" >&2
  exit 1
fi

mkdir -p "${ROOT}/.worktrees"

if [[ "$MODE" == "existing" ]]; then
  echo "Fetching from origin…"
  git fetch origin "$BRANCH" 2>/dev/null || git fetch origin || true

  if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    require_worktree_isolation "refs/heads/$BRANCH"
    echo "Attaching to local branch: $BRANCH"
    git worktree add "$WORKTREE_DIR" "$BRANCH"
  elif git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
    require_worktree_isolation "refs/remotes/origin/$BRANCH"
    echo "Attaching to remote-tracking branch: origin/$BRANCH"
    git worktree add -b "$BRANCH" "$WORKTREE_DIR" "origin/$BRANCH"
  else
    echo "error: branch '$BRANCH' not found locally or on origin" >&2
    exit 1
  fi
else
  if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    require_worktree_isolation "refs/heads/$BRANCH"
  fi
  if ! git worktree add -b "$BRANCH" "$WORKTREE_DIR" 2>/dev/null; then
    echo "branch creation failed; trying existing branch checkout" >&2
    git worktree add "$WORKTREE_DIR" "$BRANCH"
  fi
fi

# Per-worktree isolated XDG dirs so supported `bun cli` invocations
# never touch the user's real ~/.config/ctxindex, ~/.local/share/ctxindex, etc.
mkdir -p \
  "${WORKTREE_DIR}/.ctxindex/config" \
  "${WORKTREE_DIR}/.ctxindex/data" \
  "${WORKTREE_DIR}/.ctxindex/state" \
  "${WORKTREE_DIR}/.ctxindex/cache"

# The shared CLI launcher uses this ignored marker to force isolated paths.
touch "${WORKTREE_DIR}/.ctxindex/worktree"

# Bootstrap deps if a lockfile is already present (post-init runs).
if [[ -f "${WORKTREE_DIR}/bun.lock" || -f "${WORKTREE_DIR}/bun.lockb" ]]; then
  (cd "$WORKTREE_DIR" && bun install)
fi

cat <<EOF

Worktree ready:
  dir:     ${WORKTREE_DIR}
  branch:  ${BRANCH}
  sandbox: ${WORKTREE_DIR}/.ctxindex/{config,data,state,cache}

Next:
  cd ${WORKTREE_DIR}
  bun cli --help         # automatically uses the isolated XDG paths
  bun install            # if not auto-run above
EOF
