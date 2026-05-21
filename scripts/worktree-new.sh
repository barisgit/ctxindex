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
#   feature, fix, chore, docs, refactor, test, perf, ci, build, revert, spike

usage() {
  cat >&2 <<EOF
Usage: $0 [--existing] <type/name>
  Types: feature, fix, chore, docs, refactor, test, perf, ci, build, revert, spike
  Example: $0 feature/v1-impl
EOF
}

is_valid_branch_type() {
  case "$1" in
    feature|fix|chore|docs|refactor|test|perf|ci|build|revert|spike) return 0 ;;
    *) return 1 ;;
  esac
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
    echo "Attaching to local branch: $BRANCH"
    git worktree add "$WORKTREE_DIR" "$BRANCH"
  elif git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
    echo "Attaching to remote-tracking branch: origin/$BRANCH"
    git worktree add -b "$BRANCH" "$WORKTREE_DIR" "origin/$BRANCH"
  else
    echo "error: branch '$BRANCH' not found locally or on origin" >&2
    exit 1
  fi
else
  if ! git worktree add -b "$BRANCH" "$WORKTREE_DIR" 2>/dev/null; then
    echo "branch creation failed; trying existing branch checkout" >&2
    git worktree add "$WORKTREE_DIR" "$BRANCH"
  fi
fi

# Per-worktree isolated XDG-like dirs so a worktree's `ctxindex` invocations
# never touch the user's real ~/.config/ctxindex, ~/.local/share/ctxindex, etc.
mkdir -p \
  "${WORKTREE_DIR}/.ctxindex/config" \
  "${WORKTREE_DIR}/.ctxindex/data" \
  "${WORKTREE_DIR}/.ctxindex/state" \
  "${WORKTREE_DIR}/.ctxindex/cache"

cat > "${WORKTREE_DIR}/.envrc" <<'ENVRC'
# Worktree-local XDG dirs so ctxindex stays sandboxed inside this checkout.
# Activate with `direnv allow` or `source .envrc`.
export XDG_CONFIG_HOME="$PWD/.ctxindex/config"
export XDG_DATA_HOME="$PWD/.ctxindex/data"
export XDG_STATE_HOME="$PWD/.ctxindex/state"
export XDG_CACHE_HOME="$PWD/.ctxindex/cache"
ENVRC

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
  source .envrc          # or: direnv allow
  bun install            # if not auto-run above
EOF
