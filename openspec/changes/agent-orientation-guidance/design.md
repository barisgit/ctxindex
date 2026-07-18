## Context

The bundled `getting-started` skill currently links to a static root-command inventory and repeats provider setup and search workflows. Those facts already have generated help and registry-backed discovery surfaces. Agents need a durable entry point, but release-coupled prose should not compete with the running CLI as an interface reference.

## Goals / Non-Goals

**Goals:**

- Make the shipped skill a concise explanation of when and why to use ctxindex.
- Route agents to the live CLI surfaces that own command and definition discovery.
- Remove the static CLI overview without changing the skills command API or embedded packaging behavior.
- Turn drift prevention into focused content assertions.

**Non-Goals:**

- Add or change runtime commands, provider behavior, or output formats.
- Document provider-console setup, credentials, marketplace or daemon behavior, or agent-specific integrations.
- Replace generated help or registry descriptions with another hand-maintained reference.

## Decisions

1. Keep one top-level `getting-started` document as the bundled orientation. Removing only the reference document preserves the stable skill name and avoids inventing a new runtime concept.
2. Name the live entry points explicitly, but do not explain their evolving subcommand trees or schemas. This gives an agent an actionable first step while leaving exact syntax and loaded vocabulary to the running release.
3. Preserve `skills list`, `skills get`, `skills path`, JSON output, and reference inlining as runtime capabilities even when the remaining shipped orientation has no reference to inline. Tests will verify that `--inline` returns the standalone document unchanged.
4. Replace command-inventory assertions with orientation-boundary assertions. The tests should prove the required discovery routes are present and the removed static categories are absent.

## Risks / Trade-offs

- Agents receive fewer copy-paste workflows from the bundle. → The orientation points to generated help and exact registry detail from the installed release.
- Content tests can become a brittle keyword blacklist. → Assert only the issue's explicit prohibited categories and required discovery routes, while keeping runtime API tests separate.
- `--inline` becomes a no-op for the sole bundled skill. → Preserve and test the flag because future skills may reference supporting documents and it remains part of the CLI contract.

## Migration Plan

No persistent or deployed state changes. Packaging drops `skills/reference/cli-overview.md`; the embedded manifest is regenerated automatically from the remaining skill files.

## Open Questions

None.
