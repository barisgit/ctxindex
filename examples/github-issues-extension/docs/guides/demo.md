# Run the public GitHub Issues demo

The repository must be public before using it as the live demo target. From a ctxindex checkout after this Extension is integrated:

```sh
CTXINDEX_DEV_HOME="$(mktemp -d)"
export XDG_CONFIG_HOME="$CTXINDEX_DEV_HOME/config"
export XDG_DATA_HOME="$CTXINDEX_DEV_HOME/data"
export XDG_STATE_HOME="$CTXINDEX_DEV_HOME/state"
export XDG_CACHE_HOME="$CTXINDEX_DEV_HOME/cache"

bun cli init
bun cli realm add demo --name "Demo"
bun cli extension install local \
  ./examples/github-issues-extension \
  ctxindex.github-issues-demo \
  --format json
bun cli source add github.issues \
  --realm demo \
  --label ctxindex-issues \
  --config-owner barisgit \
  --config-repository ctxindex
bun cli sync --source ctxindex-issues --format json
bun cli search daemon --source ctxindex-issues --local-only --limit 5 --offset 0 --format json
```

Before `barisgit/ctxindex` is public, use the already-public `octocat/Hello-World` repository as a small connectivity fixture by replacing the two config values:

```sh
--config-owner octocat --config-repository Hello-World
```

This fallback is a suggested manual target, not a repository contacted by automated tests. GitHub permits unauthenticated public API reads but applies a shared IP rate limit; if GitHub returns 403 or 429, the sync fails without retry and preserves the previous local snapshot.
