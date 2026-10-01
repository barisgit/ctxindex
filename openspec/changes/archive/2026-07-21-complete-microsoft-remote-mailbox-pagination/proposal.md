## Why

Microsoft mailbox Sources cannot currently enumerate constrained remote mail without invented query text, reject the Profile's exact `unread` boolean filter, and stop after the first bounded Graph result set without a resumable cursor. Agents therefore cannot reliably list recent or unread Outlook mail or continue beyond the first 50 normalized messages through the generic CLI.

## What Changes

- Permit query-less `--remote` search when at least one narrowing Source, kind, field, or time constraint is present, while preserving the invalid bare-search contract.
- Extend the provider-neutral remote-search envelope and CLI with opaque continuation input and deterministic remote pagination metadata; keep local `--offset` pagination unchanged and reject offset/continuation mode combinations.
- Translate Microsoft `unread=true` and `unread=false` into exact Graph boolean predicates and verify normalized results against the shared Profile field contract.
- Return a resumable Microsoft continuation whenever more Graph messages remain, without Draft leakage, duplicates, silent loss, or mutable Graph ids on continuation requests.
- Reconcile agent guidance with the newer orientation contract: generated CLI discovery remains authoritative, while repository development guidance and tests teach recent/unread remote listing and continuation without restoring a static bundled command inventory.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `search-routing`: query-less constrained remote execution, provider-neutral continuation input/output, deterministic remote pagination metadata, and invalid pagination combinations.
- `microsoft-graph-adapters`: exact unread translation and verification plus bounded resumable Graph mailbox paging with immutable ids on every page.

## Impact

The change affects the Extension SDK remote-search types, provider-neutral core search planner/source execution, generic CLI search parsing/help/JSON output, the Microsoft mailbox Adapter, loopback Graph mocks, compiled CLI coverage, and repository-development guidance. It adds no storage schema, provider-specific CLI path, daemon dependency, credential access, live-provider checkpoint, mutation, Draft behavior, or compatibility alias.
