## Why

The loaded registry interface is already too large for Citty help and currently renders Action JSON Schema as an unreadable one-line blob. Because Extensions will make the interface grow substantially, agents need progressive discovery that is concise by default and lossless only when explicitly requested.

## What Changes

- Keep root and command `--help` concise and Citty-styled, with short pointers to registry discovery rather than an appended full interface dump.
- Make `describe` and selector-only forms return compact deterministic indexes.
- Make `describe <profile|adapter|action> <id>` return full readable detail with structured Action input fields and constraints.
- Make JSON follow the same list/detail split; exact selected details retain full JSON Schema.
- Add `describe --full` as the explicit complete registry snapshot in text, Markdown, or JSON.
- **BREAKING**: bare `describe --json` changes from the complete registry snapshot to a compact index; callers requiring the complete snapshot must add `--full`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `profile-vocabulary`: Scale the registry-derived CLI and agent interface through compact indexes, selected detail, explicit full snapshots, and readable schema presentation.

## Impact

Affected surfaces are the `describe` CLI grammar and output, root/command help, registry text/Markdown/JSON formatting, bundled agent guidance, interface meta-contracts, and focused/e2e tests. No storage, provider I/O, registry validation, or domain behavior changes.
