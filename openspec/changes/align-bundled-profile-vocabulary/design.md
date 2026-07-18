## Context

The built-in Extension registers exactly `communication.message@1`, `calendar.event@1`, and `file@1`, and its focused test locks that inventory. A copied rule in the canonical Profile specification and the accepted V1 design instead describe six bundled Profiles and future MBOX/ICS exports. Artifact is already a distinct descriptor and managed-byte concept, while conversation traversal is expressed through message Relations.

## Goals / Non-Goals

**Goals:**

- Make the normative and accepted-design vocabulary agree with the built-in registry.
- Keep future domains and export formats available through the generic Profile API without presenting them as V1 commitments.
- Prevent the contradictory bundled inventory from returning unnoticed.

**Non-Goals:**

- Add, remove, or alter runtime Profile registrations, exports, Relations, Artifact behavior, or extension APIs.
- Select canonical shapes for future conversation or task Profiles.
- Rewrite historical milestones, the backlog, or the non-normative system projection.

## Decisions

The canonical contract will name the three bundled definitions with versions: `communication.message@1`, `calendar.event@1`, and `file@1`. It will separately state that extension-defined Profiles use the same public API, leaving future domain selection open.

The accepted design will describe conversation behavior as message Relations and Artifact composition as descriptors. MBOX and ICS will not appear as current Profile exports because neither format is registered.

A focused static test will compare the normative and accepted-design inventory to the existing built-in registry expectation. This supplements, rather than duplicates, the runtime registration test.

## Risks / Trade-offs

- Documentation could drift when a future bundled Profile is implemented. → The static guard fails until the runtime inventory, canonical specification, and accepted design are updated together through a future OpenSpec change.
- Removing named future Profiles may be read as removing extensibility. → Retain explicit language that external Extensions can define Profiles through the same public API and that future domains are not pre-selected by V1.

## Migration Plan

Not applicable. No deployed runtime or persistent state changes.

## Open Questions

None.
