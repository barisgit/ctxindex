#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cli_dir="$repo_root/apps/cli"
bin_path="$cli_dir/bin/ctxindex.mjs"
link_package="@ctxindex/cli"
package_bin="bin/ctxindex.mjs"
tmp_dir=$(mktemp -d)
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

log() {
  printf 'bun-link: %s\n' "$*" >&2
}

die() {
  printf 'bun-link: ERROR: %s\n' "$*" >&2
  exit 1
}

run_in_dir() {
  local description="$1"
  local dir="$2"
  shift 2

  log "$description"
  (cd "$dir" && "$@") || die "$description failed"
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

if [[ ! -x "$bin_path" ]]; then
  die "required CLI binary is not executable: $bin_path"
fi

if [[ ! -d "$repo_root/node_modules" || ! -e "$repo_root/node_modules/@ctxindex/cli" || ! -e "$repo_root/node_modules/@ctxindex/core" ]]; then
  log 'dependencies are missing; running bun install'
  if ! (cd "$repo_root" && bun install --frozen-lockfile); then
    log 'bun install --frozen-lockfile failed; retrying bun install'
    (cd "$repo_root" && bun install) || die 'bun install failed'
  fi
else
  log 'dependencies already installed; skipping bun install'
fi

run_in_dir "registering $link_package with bun link" "$cli_dir" bun link

bun_global_bin=$(bun pm bin -g)
global_node_modules=$(cd "$(dirname "$bun_global_bin")/install/global/node_modules" && pwd) \
  || die 'could not locate Bun global node_modules directory'
global_target="$global_node_modules/$link_package/$package_bin"

case "$global_target" in
  "$global_node_modules"/*) ;;
  *) die "linked target is outside Bun global node_modules: $global_target" ;;
esac

if [[ ! -f "$global_target" ]]; then
  die "linked target does not exist: $global_target"
fi

run_in_dir "linking $link_package into fresh project" "$tmp_dir" bun link "$link_package"

tmp_bin="$tmp_dir/node_modules/.bin/ctxindex"
if [[ ! -f "$tmp_bin" ]]; then
  die "fresh project did not create ctxindex binary: $tmp_bin"
fi

version_stderr="$tmp_dir/version.stderr"
if ! version_output=$("$tmp_bin" --version 2>"$version_stderr"); then
  cat "$version_stderr" >&2
  die "$tmp_bin --version failed"
fi
assert_semver 'ctxindex --version' "$version_output"

path_version_stderr="$tmp_dir/path-version.stderr"
if ! path_version_output=$(PATH="$tmp_dir/node_modules/.bin:$PATH" ctxindex --version 2>"$path_version_stderr"); then
  cat "$path_version_stderr" >&2
  die 'ctxindex --version failed through the fresh project .bin path'
fi
assert_semver 'PATH-prefixed ctxindex --version' "$path_version_output"

help_stderr="$tmp_dir/help.stderr"
if ! help_output=$("$tmp_bin" --help 2>"$help_stderr"); then
  cat "$help_stderr" >&2
  die "$tmp_bin --help failed"
fi

for expected in \
  'Usage:' \
  'Commands:' \
  '  init' \
  '  auth add <provider>' \
  '  auth list [--json]' \
  '  realm add <slug>' \
  '  realm list [--json]' \
  '  source add [<adapter-id>] [--adapter <adapter-id>]' \
  '  source list [--realm <slug>] [--json]' \
  '  source remove <source-id>' \
  '  sync [--source <id>]' \
  '  search <query>' \
  '  status [--source <id>] [--json]' \
  '  secrets migrate <backend>' \
  '  skills list | get <name> [--inline] | path'; do
  if ! grep -Fq "$expected" <<<"$help_output"; then
    die "missing root help text: $expected"
  fi
done

sanitized_stderr="$tmp_dir/sanitized.stderr"
if sanitized_output=$(env -i PATH=/usr/bin "$global_target" --version 2>"$sanitized_stderr"); then
  assert_semver 'PATH=/usr/bin ctxindex --version' "$sanitized_output"
else
  if [[ "$(uname -s)" == 'Darwin' ]]; then
    log 'skipping PATH=/usr/bin shebang probe on macOS because /usr/bin/env cannot locate bun unless bun is installed under /usr/bin'
  else
    cat "$sanitized_stderr" >&2
    die "PATH=/usr/bin shebang probe failed for $global_target"
  fi
fi

printf '%s\n' "$version_output"
log "verified linked ctxindex binary at $tmp_bin"
