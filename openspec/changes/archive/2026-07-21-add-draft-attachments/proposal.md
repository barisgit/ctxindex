## Why

The portable email Draft Actions can persist standalone and threaded-reply text, but they cannot attach bytes already managed by ctxindex. Agents therefore cannot prepare provider-persisted Drafts with files through the same typed, Source-scoped, reversible workflow. Attachment creation is independently deliverable, while cross-provider attachment replacement during update is not atomic and needs an explicit preservation contract before implementation.

## What Changes

- Extend both portable Draft create branches with an optional non-empty list of ctxindex-managed Artifact references.
- Resolve every attachment from verified cached bytes in the exact selected Source before authentication or provider mutation; reject malformed, foreign, unavailable, duplicate, or unsafe attachment inputs locally.
- Create standalone and threaded-reply Drafts with all selected attachments through one no-retry provider mutation in Gmail and Microsoft Graph.
- Define update attachment semantics explicitly: callers cannot add, remove, clear, or replace attachments through update; existing attachments must be preserved, and an update must fail before mutation when preservation cannot be proven locally.
- Preserve the existing provider-neutral CLI, stable Draft Refs, immutable reply context, reversible-only boundary, and strict absence of send capability.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `profile-vocabulary`: Add provider-independent managed attachment inputs and attachment provenance for Draft Actions.
- `provider-actions`: Define Source-scoped managed Artifact resolution, pre-mutation validation, one-shot create, and preservation-only update behavior.
- `retrieval-and-artifacts`: Define the locally verified cached-byte contract Actions consume without provider reads.
- `microsoft-graph-adapters`: Create standalone and reply Drafts with attachments through MIME while preserving attachment collections on update.

## Impact

The change affects `@ctxindex/profiles`, the public `ActionContext` seam in `@ctxindex/extension-sdk`, generic Action orchestration and managed Artifact storage in `@ctxindex/core`, Gmail and Microsoft mailbox Draft handlers in `@ctxindex/official`, generated registry documentation, and mocked CLI workflows. It adds no provider scopes, tables, migrations, provider-specific CLI paths, real-provider automated tests, or irreversible effects.
