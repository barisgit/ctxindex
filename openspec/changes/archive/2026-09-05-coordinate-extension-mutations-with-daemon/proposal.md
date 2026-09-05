## Why

Extension install, update, and uninstall mutate the files from which the daemon builds its immutable registry. With automatic daemon startup enabled, the current direct mutation path either fails while reading SQLite-backed validation state or can race a daemon startup and leave the live daemon serving an obsolete registry. Extension lifecycle commands need one coordinated ownership boundary.

## What Changes

- Stop a running local daemon before an Extension install, update, or uninstall mutates installed state.
- Retain direct shared database ownership for the complete mutation so no daemon can start and load a partially changing registry.
- Restart a daemon that was running before the mutation, after direct ownership is released, whether the mutation succeeds or fails.
- Preserve direct behavior on platforms where daemon ownership is unsupported and preserve existing Extension errors and output.

## Capabilities

### New Capabilities


### Modified Capabilities

- `extension-installation`: Coordinate installed Extension mutations with the local daemon lifecycle and immutable registry.
- `local-daemon`: Define safe stop, direct mutation ownership, and conditional restart behavior for Extension lifecycle commands.

## Impact

The change affects the CLI Extension command orchestration and daemon lifecycle integration. It does not change installation records, Catalog metadata, registry schemas, SQLite schemas, RPC contracts, or package acquisition semantics.
