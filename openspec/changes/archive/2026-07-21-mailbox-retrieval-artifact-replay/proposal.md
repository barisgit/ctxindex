## Why

Google and Microsoft mailbox Adapters already implement the same generic remote search, complete retrieval, managed Artifact, and Profile export contracts, but automated acceptance evidence is asymmetric: Outlook proves the complete attachment lifecycle while Gmail stops after cached retrieval. One deterministic shared replay can prove provider-neutral parity without live accounts, captured provider data, mailbox synchronization, or production behavior changes.

## What Changes

- Add test-only automated evidence that runs one common mailbox retrieval and Artifact lifecycle for `google.mailbox` and `microsoft.mailbox` through fresh compiled CLI processes.
- Add obviously invented provider-shaped fixtures under reserved `.test` domains and test-local provider drivers limited to setup and bounded redacted request inspection.
- Verify stable remote-search Refs, complete ad-hoc hydration, cached retrieval, exact Artifact download and cache reuse, purge and re-fetch, offline Profile exports, and pre-I/O rejection of malformed or foreign Refs.
- No production behavior, public interface, schema, provider scope, mailbox projection, or CLI command changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `retrieval-and-artifacts`: require deterministic automated cross-provider mailbox replay evidence for the accepted retrieval, Artifact cache/purge, export, and Ref-validation contracts.

## Impact

The change is limited to CLI end-to-end test infrastructure, invented fixtures, and OpenSpec artifacts. It introduces no dependency, live authentication, provider recording, production provider data, secret handling, schema migration, mailbox sync, daemon, or runtime security-boundary change.
