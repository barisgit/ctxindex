## Context

`packages/adapters` is a private pre-release workspace package whose public entry exports the official Google, Microsoft, and local integrations. Its boundary includes Provider and OAuth App definitions, Source Adapters, shared provider transports, authored documentation trees, and composed Extension roots. Generic Adapter authoring contracts already live in `@ctxindex/extension-sdk`, so the existing distribution name understates its role and becomes misleading once published.

## Goals / Non-Goals

**Goals:**

- Give the official integration distribution one accurate package and directory name.
- Update every executable, fixture, verifier, specification, generated-metadata, and documentation consumer atomically.
- Preserve exported values, stable ids, and runtime behavior.

**Non-Goals:**

- Splitting integrations into independently versioned packages or adding package subexports.
- Changing Profile contracts, Adapter behavior, provider traffic, Extension selection, or managed OAuth policy.
- Providing a deprecated alias for an unpublished package.

## Decisions

Rename both the workspace directory and npm package in one change. Keeping `packages/adapters` behind an `@ctxindex/official` name would leave two competing architectural labels; keeping an alias would add a compatibility surface before release. All current root exports remain unchanged so the rename affects only acquisition and import coordinates.

Repository verification will treat any remaining production, package, current-specification, or current-documentation reference to the old directory/package as stale. Archived OpenSpec artifacts remain historical evidence and are not rewritten unless a current reference depends on them.

## Risks / Trade-offs

- [A stale fixture or manifest resolves the old package only in a compiled lane] → Update package graph checks and run relocated compiled Extension/daemon tests.
- [Concurrent mail/chat Profile changes overlap imports or codemaps] → Keep this branch structural and avoid touching Profile source contracts or stable ids.
- [Generated lock/cartography metadata drifts] → Regenerate it from the renamed workspace and run strict repository validation.

## Migration Plan

Not applicable. The package is private and unpublished, and no persistent or deployed state contains its import coordinate.

## Open Questions

None.
