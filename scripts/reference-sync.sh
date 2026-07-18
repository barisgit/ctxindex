#!/usr/bin/env bash
# Materialize all Git references from reference.json (+ reference.local.json) into .reference/<name>.
# Shallow clones by default; existing clones are updated. Dir references are listed, not copied.
set -euo pipefail
cd "$(dirname "$0")/.."

local_manifest="$(mktemp)"
trap 'rm -f "$local_manifest"' EXIT
if [ -f reference.local.json ]; then cat reference.local.json > "$local_manifest"; else printf '{}\n' > "$local_manifest"; fi

mkdir -p .reference

jq -r -s '.[0] * .[1] | to_entries[] | [.key, .value.type, (.value.url // .value.path)] | @tsv' \
  reference.json "$local_manifest" |
while IFS="$(printf '\t')" read -r name type target; do
  case "$type" in
    git)
      if [ -d ".reference/$name/.git" ]; then
        git -C ".reference/$name" fetch --depth 1 --no-tags origin
        git -C ".reference/$name" reset --hard FETCH_HEAD --quiet
      else
        git clone --depth 1 --single-branch --no-tags "$target" ".reference/$name"
      fi
      printf '%s\tgit\t%s\n' "$name" "$(git -C ".reference/$name" rev-parse --short=12 HEAD)"
      ;;
    dir)
      if [ -d "$target" ]; then
        printf '%s\tdir\t%s\n' "$name" "$target"
      else
        printf '%s\tdir\tMISSING: %s\n' "$name" "$target" >&2
      fi
      ;;
  esac
done
