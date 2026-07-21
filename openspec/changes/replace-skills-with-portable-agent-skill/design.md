## Context

ctxindex has two release-bundled agent knowledge surfaces. `docs list|get|search` exposes comprehensive product and Extension documentation, while `skills list|get|path` wraps one short proprietary Markdown file through a separate loader, manifest, command group, and packaging tests. Agent harnesses commonly understand the portable one-file `SKILL.md` convention, so one exact file is more useful than a generic ctxindex-specific skill registry.

## Goals / Non-Goals

**Goals:**

- Ship one concise, portable ctxindex Agent Skill from a canonical repository file.
- Preserve the exact file bytes in source and relocated compiled CLI execution.
- Make retrieval obvious under the existing offline `docs` namespace.
- Remove the redundant generic skills command group and implementation.

**Non-Goals:**

- Build a skill marketplace, installer, registry, or agent-specific integration.
- Expose Extension documentation as executable skills.
- Duplicate command trees, loaded schemas, or provider-specific vocabulary in prose.
- Restrict Actions implemented by third-party Extensions.

## Decisions

1. The canonical source is `skills/ctxindex/SKILL.md`. It uses only `name` and `description` YAML frontmatter followed by a short Markdown body. The description explains the product and when an agent should activate the skill; the body teaches live discovery and one Bash composition.
2. `ctxindex docs get-skill` is the sole retrieval command. Default output is the exact file text. `--format json` returns deterministic safe metadata plus the exact text, and `--output <path>` uses the docs command's existing exclusive-copy semantics. This keeps discovery under one knowledge namespace without pretending there are multiple skills.
3. The skill is embedded directly at build time from its canonical file. It is not merged into the product/Extension Documentation Tree inventory or search index: `docs list|get|search` retain their existing ownership and `get-skill` is one explicit release asset.
4. The generic `skills list|get|path` commands and their old `getting-started.md` are removed rather than aliased. The repository is pre-alpha and keeping both surfaces would preserve the duplication this change removes.

## Risks / Trade-offs

- Existing pre-alpha callers of `skills get getting-started` break. → Generated help and the portable skill advertise `docs get-skill`; no deprecated alias is introduced.
- A dedicated `get-skill` verb is less generic than `docs get`. → The product intentionally owns exactly one portable skill, and the narrow command avoids inventing a path namespace or registry.
- Skill prose can drift from runtime behavior. → Keep it limited to stable operating rules and live discovery commands, with focused content and compiled-byte tests.

## Migration Plan

No persistent state changes. Remove the old command and source assets in the same release that adds `docs get-skill` and the portable file.

## Open Questions

None.
