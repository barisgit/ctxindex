## Why

Issue #55 reproduced `client add` on fresh state before `ctxindex init`. Command dependency setup silently read default Keychain configuration, created SQLite state, and attempted a native credential write without running backend selection. On a machine where the login Keychain was unavailable, this surfaced only as `failed to write keychain secret`. Initialization immediately selected the working encrypted file backend and made the same Client add succeed. Stateful commands must not bootstrap partial state or touch credentials before explicit initialization.

## What Changes

- Require completed explicit `ctxindex init` before commands that open or mutate ctxindex's durable database-backed state.
- Return safe, deterministic initialization guidance before reading Client credentials or opening SQLite.
- Keep help, argument validation, discovery-only definition commands, and `init` itself usable without initialized state.
- Add fresh-state e2e regression coverage proving pre-init Client add does not create database, config, Keychain mock, or secret files.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `cli-surface`: Define the explicit initialization precondition for durable stateful commands.

## Impact

The change is isolated to CLI initialization preflight, Client command ordering, focused e2e tests, and CLI implementation doctrine. It does not change secret backends, Keychain indexing, provider behavior, schemas, or stored data.
