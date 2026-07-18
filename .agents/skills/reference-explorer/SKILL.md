---
name: reference-explorer
description: "Use when repo work needs external source context from reference manifests: clone/update shared refs under .reference, use local dirs in place, and cite paths/commits."
---

# Reference Explorer

Use this skill when local context from another repo, sibling project, or public reference will improve an answer or implementation. References are declared in manifests at the repo root, then resolved only when needed.

Do not vendor reference content into source files. Quote only what is needed, and cite the path plus commit or fetched data timestamp.

## Manifests

Two manifests define the reference set:

- `reference.json` is committed. It contains only shared references with public Git URLs that any agent can clone.
- `reference.local.json` is gitignored. It contains personal/private references: private Git URLs and local directory paths. The repo must build and work when this file is absent.

Entry schema is deliberately minimal:

```json
{
  "name": { "type": "git", "url": "https://example.com/org/repo", "note": "optional" },
  "other-name": { "type": "dir", "path": "../sibling", "note": "optional" }
}
```

`type` is only `git` or `dir`. Git entries require `url`; dir entries require `path`. Local entries win on name conflicts when the manifests are merged.

Example `reference.local.json` shape, for illustration only; do not commit this file:

```json
{
  "lume": { "type": "dir", "path": "../lume", "note": "local sibling checkout" },
  "private-example": { "type": "git", "url": "git@github.com:example/private-reference.git", "note": "private reference" }
}
```

API artifacts such as `models.dev` are not in the manifest under this schema. Add an API entry type only if the skill is explicitly expanded to cover API materialization.

## Non-negotiables

1. Always read both manifests before adding or materializing anything. This list-before-add step is mandatory even when `reference.local.json` is missing:

```bash
cat reference.json
if [ -f reference.local.json ]; then
  cat reference.local.json
else
  printf '{}\n'
fi
```

2. Resolve the merged view and reuse existing references when they match the task.
3. Materialize only the references the task needs.
4. Git entries clone or update idempotently in `.reference/<name>/`.
5. Dir entries are used in place via their `path`, not symlinked into `.reference/`. In-place use avoids symlink surprises, stale links, and accidental commits of machine-specific paths.
6. When quoting or relying on a Git reference, record the commit and dirty state.
7. Keep commands to shell, `jq`, `git`, and task-specific tools. Do not add Python helpers.

## List and validate references

Run from the repo root.

```bash
cat reference.json
if [ -f reference.local.json ]; then
  cat reference.local.json
else
  printf '{}\n'
fi

local_manifest="$(mktemp)"
if [ -f reference.local.json ]; then
  cat reference.local.json > "$local_manifest"
else
  printf '{}\n' > "$local_manifest"
fi

jq -e -s '
  all(.[];
    to_entries
    | all(
        .value.type == "git" and (.value.url | type == "string") and (.value.path | not)
        or .value.type == "dir" and (.value.path | type == "string") and (.value.url | not)
      )
  )
' reference.json "$local_manifest"

jq -s '
  .[0] * .[1]
  | to_entries
  | sort_by(.key)
  | .[]
  | [.key, .value.type, (.value.url // .value.path), (.value.note // "")]
  | @tsv
' reference.json "$local_manifest"

rm "$local_manifest"
```

## Materialize everything

`scripts/reference-sync.sh` shallow-clones or updates every Git reference into `.reference/<name>/` and lists dir references. Use it to hydrate the full inventory in one step; use the per-reference flow below when only one is needed.

```bash
bash scripts/reference-sync.sh
```

## Materialize one reference

Set `name` to the reference needed for the task. Git references clone/update under `.reference/<name>/`; dir references print the real path to use.

```bash
name=pi
local_manifest="$(mktemp)"
if [ -f reference.local.json ]; then
  cat reference.local.json > "$local_manifest"
else
  printf '{}\n' > "$local_manifest"
fi
entry="$(jq -c --arg name "$name" -s '.[0] * .[1] | .[$name] // empty' reference.json "$local_manifest")"
rm "$local_manifest"

if [ -z "$entry" ]; then
  printf 'unknown reference: %s\n' "$name" >&2
  exit 1
fi

type="$(printf '%s\n' "$entry" | jq -r '.type')"
case "$type" in
  git)
    url="$(printf '%s\n' "$entry" | jq -r '.url')"
    mkdir -p .reference
    if [ -d ".reference/$name/.git" ]; then
      git -C ".reference/$name" pull --ff-only
    else
      git clone "$url" ".reference/$name"
    fi
    git -C ".reference/$name" rev-parse --short=12 HEAD
    git -C ".reference/$name" status --short
    ;;
  dir)
    path="$(printf '%s\n' "$entry" | jq -r '.path')"
    if [ ! -d "$path" ]; then
      printf 'missing directory reference %s: %s\n' "$name" "$path" >&2
      exit 1
    fi
    printf '%s\t%s\n' "$name" "$path"
    if [ -d "$path/.git" ]; then
      git -C "$path" rev-parse --short=12 HEAD
      git -C "$path" status --short
    fi
    ;;
  *)
    printf 'unsupported reference type for %s: %s\n' "$name" "$type" >&2
    exit 1
    ;;
esac
```

## Add a reference

Read and list both manifests first. Then choose the manifest by shareability.

Shared public Git reference, committed in `reference.json`:

```bash
cat reference.json
if [ -f reference.local.json ]; then cat reference.local.json; else printf '{}\n'; fi

jq '. + {
  "new-reference": {
    "type": "git",
    "url": "https://github.com/example/new-reference",
    "note": "why this shared reference exists"
  }
}' reference.json > reference.json.tmp
mv reference.json.tmp reference.json
```

Personal/private reference, never committed:

```bash
cat reference.json
if [ -f reference.local.json ]; then cat reference.local.json; else printf '{}\n'; fi

if [ ! -f reference.local.json ]; then
  printf '{}\n' > reference.local.json
fi
jq '. + {
  "lume": {
    "type": "dir",
    "path": "../lume",
    "note": "local sibling checkout"
  }
}' reference.local.json > reference.local.json.tmp
mv reference.local.json.tmp reference.local.json
```

Private Git URLs also belong in `reference.local.json`:

```bash
jq '. + {
  "private-reference": {
    "type": "git",
    "url": "git@github.com:example/private-reference.git",
    "note": "private source context"
  }
}' reference.local.json > reference.local.json.tmp
mv reference.local.json.tmp reference.local.json
```

## Searching references

Scope searches to materialized Git references or real dir paths from the merged view. Avoid dumping large files into the conversation; extract the lines needed for the decision.

```bash
rg -n "ProviderDefinition|streamText|generateText" .reference/pi .reference/opencode
rg -n "skill|extension|session" ../lume
```

For dir entries, cite the real path from `reference.local.json`. For Git entries, cite `.reference/<name>/<path>` or the real dir path plus the commit.

## Answer style

- Lead with the finding or decision.
- Include evidence bullets with reference name, path, and commit or fetched timestamp.
- Separate copied precedent from the repo-local change you recommend.
- If a reference is dirty, missing, private, or not a Git checkout, say so before relying on it.
