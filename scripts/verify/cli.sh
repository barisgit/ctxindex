#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
bin_path="$repo_root/apps/cli/bin/ctxindex.mjs"
package_bin_path="$repo_root/apps/cli/dist/ctxindex.mjs"

log() {
  printf 'cli: %s\n' "$*" >&2
}

die() {
  printf 'cli: ERROR: %s\n' "$*" >&2
  exit 1
}

assert_semver() {
  local label="$1"
  local output="$2"

  if [[ -z "$output" ]]; then
    die "$label produced empty stdout"
  fi

  if [[ ! "$output" =~ ^[0-9]+\.[0-9]+ ]]; then
    die "$label stdout did not start with a semver-ish version: $output"
  fi
}

if ! command -v bun >/dev/null 2>&1; then
  die 'bun is required but was not found on PATH'
fi

if [[ ! -f "$bin_path" ]]; then
  die "required CLI binary is missing: $bin_path"
fi

if [[ ! -d "$repo_root/node_modules" || ! -e "$repo_root/node_modules/ctxindex" || ! -e "$repo_root/node_modules/@ctxindex/core" ]]; then
  log 'dependencies are missing; running bun install'
  if ! (cd "$repo_root" && bun install --frozen-lockfile); then
    log 'bun install --frozen-lockfile failed; retrying bun install'
    (cd "$repo_root" && bun install) || die 'bun install failed'
  fi
else
  log 'dependencies already installed; skipping bun install'
fi

# Probe `bun cli --version` from the repo root.
version_stderr=$(mktemp)
trap 'rm -f "$version_stderr"' EXIT

if ! version_output=$(cd "$repo_root" && bun cli --version 2>"$version_stderr"); then
  cat "$version_stderr" >&2
  die 'bun cli --version failed from repo root'
fi
assert_semver 'bun cli --version (root)' "$version_output"

# Probe `bun run cli --version` from apps/cli.
if ! workspace_version=$(cd "$repo_root/apps/cli" && bun run cli --version 2>"$version_stderr"); then
  cat "$version_stderr" >&2
  die 'bun run cli --version failed from apps/cli'
fi
assert_semver 'bun run cli --version (apps/cli)' "$workspace_version"

# Probe the public package bundle and its merged OAuth App command surface.
(cd "$repo_root" && bun run build:cli-package)
if [[ ! -x "$package_bin_path" ]]; then
  die "required CLI package binary is missing or not executable: $package_bin_path"
fi
if ! package_version=$(cd "$repo_root" && bun "$package_bin_path" --version 2>"$version_stderr"); then
  cat "$version_stderr" >&2
  die 'packaged ctxindex --version failed'
fi
assert_semver 'packaged ctxindex --version' "$package_version"
if ! package_oauth_app_help=$(cd "$repo_root" && NO_COLOR=1 bun "$package_bin_path" oauth-app --help 2>"$version_stderr"); then
  cat "$version_stderr" >&2
  die 'packaged ctxindex oauth-app --help failed'
fi
grep -Fq 'USAGE ctxindex oauth-app add|list|remove' <<<"$package_oauth_app_help" || die 'packaged ctxindex oauth-app help is incomplete'

# Help output sanity: every v1 top-level command must appear.
if ! help_output=$(cd "$repo_root" && NO_COLOR=1 bun cli --help 2>"$version_stderr"); then
  cat "$version_stderr" >&2
  die 'bun cli --help failed'
fi

for expected in \
  'USAGE ctxindex init|account|oauth-app|describe|extensions|action|artifact|purge|realm|source|sync|get|export|thread|search|status|secrets|skills' \
  'init' \
  'account' \
  'oauth-app' \
  'realm' \
  'source' \
  'sync' \
  'search' \
  'status' \
  'secrets' \
  'skills'; do
  if ! grep -Fq "$expected" <<<"$help_output"; then
    die "missing root help text: $expected"
  fi
done

if ! oauth_app_help=$(cd "$repo_root" && NO_COLOR=1 bun cli oauth-app --help 2>"$version_stderr"); then
  cat "$version_stderr" >&2
  die 'bun cli oauth-app --help failed'
fi
for expected in 'USAGE ctxindex oauth-app add|list|remove' 'add' 'list' 'remove'; do
  grep -Fq "$expected" <<<"$oauth_app_help" || die "missing oauth-app help text: $expected"
done

if ! account_help=$(cd "$repo_root" && NO_COLOR=1 bun cli account --help 2>"$version_stderr"); then
  cat "$version_stderr" >&2
  die 'bun cli account --help failed'
fi
for expected in 'USAGE ctxindex account add|list|remove' 'add' 'list' 'remove'; do
  grep -Fq "$expected" <<<"$account_help" || die "missing account help text: $expected"
done

# Per-command help sanity: source / skills / oauth-app / account subcommands enumerated.
if ! source_help=$(cd "$repo_root" && NO_COLOR=1 bun cli source --help 2>"$version_stderr"); then
  cat "$version_stderr" >&2
  die 'bun cli source --help failed'
fi
for expected in 'USAGE ctxindex source add|list|remove' 'add' 'list' 'remove'; do
  grep -Fq "$expected" <<<"$source_help" || die "missing source help text: $expected"
done

if ! skills_help=$(cd "$repo_root" && NO_COLOR=1 bun cli skills --help 2>"$version_stderr"); then
  cat "$version_stderr" >&2
  die 'bun cli skills --help failed'
fi
for expected in 'USAGE ctxindex skills list|get|path' 'list' 'get' 'path'; do
  grep -Fq "$expected" <<<"$skills_help" || die "missing skills help text: $expected"
done

if ! secrets_help=$(cd "$repo_root" && NO_COLOR=1 bun cli secrets --help 2>"$version_stderr"); then
  cat "$version_stderr" >&2
  die 'bun cli secrets --help failed'
fi
for expected in 'USAGE ctxindex secrets status|backend' 'status' 'backend'; do
  grep -Fq "$expected" <<<"$secrets_help" || die "missing secrets help text: $expected"
done

printf '%s\n' "$version_output"
log "verified bun cli binary at $bin_path"
