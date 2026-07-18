## Why

Bundled skills currently repeat command inventories, provider setup, and workflow details that are already exposed by the live CLI and loaded registry. That duplicate prose can drift from the shipped interface, so issue #18 promotes the backlog item to make bundled skills a concise orientation layer and keep live discovery authoritative.

## What Changes

- Limit bundled skill prose to what ctxindex is, when an agent should use it, and how to enter the live discovery surfaces.
- Direct agents to root help, the generated definition index and exact JSON definition detail, loaded Extension inventory, and bundled skill discovery.
- Remove the static `skills/reference/cli-overview.md` command inventory while preserving `skills list/get/path`, `--json`, and `--inline` behavior.
- Require tests to reject static command trees, provider credentials, Profile fields, and Action schemas in shipped orientation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cli-surface`: Restrict bundled skills to orientation prose and establish live CLI discovery as the authority for commands and loaded definitions.
- `search-routing`: Remove the requirement that bundled orientation duplicate search enumeration and pagination workflow details.

## Impact

This change affects bundled Markdown under `skills/`, its embedded compiled representation, and focused verification, CLI, e2e, and compiled-binary tests. It changes no runtime commands, parsing, output shapes, provider behavior, credentials, extension loading, or agent integration layer.
