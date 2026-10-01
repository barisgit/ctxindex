## Context

The daemon loads Extensions once, keeps one immutable active registry, and already routes stateful CLI work through a strict oRPC contract when exact runtime discovery selects it. Documentation commands currently ignore that selection and call the direct CLI Extension loader. The result can disagree with the daemon's registry and execute installed Extension modules a second time outside the selected runtime boundary.

Bundled product documentation is different: it is build-time CLI content, does not depend on the active Extension registry, and must remain available without daemon state. Extension documentation is passive but can include binary image assets, so the wire format must be explicit and bounded.

## Goals / Non-Goals

**Goals:**

- Make one daemon-selected invocation observe only the daemon's immutable Extension documentation projection.
- Preserve bundled product docs as CLI-local embedded content.
- Preserve direct/no-daemon behavior and selected-daemon fail-closed semantics.
- Expose only strict bounded portable documentation data across RPC.

**Non-Goals:**

- Daemon lifecycle automation, streaming sync responses, browser rendering, OpenAPI, batching, remote daemons, documentation mutation, or Extension reload.
- Changing Extension documentation authoring, validation, identity, or storage.
- Introducing a second documentation index or persistent cache.

## Decisions

### Expose documentation operations rather than one whole-projection snapshot

The RPC contract will expose Extension-only list, exact-get, and bounded-search operations backed by the daemon's existing core documentation service. This avoids transferring every Markdown document and image merely to list or search documentation, and it keeps each result independently bounded. Returning the entire projection was rejected because multiple valid 8 MiB Extension trees can create an unnecessarily large all-or-nothing response.

### Route once and compose at the CLI presentation boundary

The CLI will select the runtime once while constructing its documentation command service. Direct mode composes bundled documentation with the directly loaded Extension projection exactly as today. Selected-daemon mode keeps the bundled service local and delegates only Extension list/get/search operations to the daemon. Combined list/search output is sorted by the existing deterministic origin, Extension, and path order. A selected daemon error is surfaced; it never causes direct loading.

### Encode binary assets explicitly

RPC documentation get results use strict discriminated values. Markdown and generated metadata carry bounded UTF-8 strings; image assets carry canonical Base64 plus verified media type and byte size. The CLI decodes the asset only after the strict RPC schema accepts it. No procedure exposes source paths, module URLs, deferred readers, callbacks, schemas, or executable definitions.

## Risks / Trade-offs

- [RPC and CLI can drift in ordering or presentation] -> Reuse the same public item shape, specify exact ordering, and cover combined output with focused tests.
- [A generated metadata item can exceed the wire per-item bound] -> Fail the request as `result_too_large`; do not truncate or return invalid partial documentation.
- [Base64 adds binary transfer overhead] -> Only exact asset retrieval transfers bytes; list and search never transfer image content.
- [The daemon application gains a read-only service family] -> Keep all documentation semantics in core and make the RPC layer a strict projection only.

## Migration Plan

Not applicable. No persisted state, database schema, discovery metadata, or Extension package format changes.

## Open Questions

None.
