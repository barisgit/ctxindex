# apps/cli/src/skills/

## Responsibility

Loads bundled skill markdown for the CLI `skills` command, supporting listing, retrieval, and optional recursive inlining.

## Design / patterns

- `SkillsSource` is a discriminated union over live `filesystem` and bundled `embedded` content.
- `manifest.macro.ts` provides Bun's build-time `buildBundledSkillsManifest`; `resolve.ts` prefers an available filesystem skills root and otherwise uses the embedded manifest.
- `loader.ts` applies deterministic sorting, summary extraction, traversal guards, relative-link resolution, and cycle detection during recursive inlining.
- `SkillRecord`, `SkillDocument`, and `EmbeddedSkillFile` separate listing metadata, full content, and bundled storage.

## Data & control flow

1. `resolveBundledSkills()` returns a filesystem or embedded `SkillsSource`.
2. `listSkills(source)` enumerates top-level markdown files, excludes `README.md`, reads summaries, and sorts by name.
3. `getSkillContent(source, name, { inline })` calls `getSkill`; with inlining enabled, `inlineSkillFile` recursively replaces relative markdown references while tracking a cycle-detection stack.
4. Results flow to `apps/cli/src/format/skills.ts` for rendering.

## Integration points

- `apps/cli/src/commands/skills.ts` consumes `resolveBundledSkills`, `listSkills`, and `getSkillContent`.
- `apps/cli/src/format/skills.ts` consumes `SkillRecord` and `SkillDocument`.
- `loader.ts` uses `compareStrings` from `@ctxindex/core/registry`; filesystem mode uses `node:fs/promises` and `node:path`.
- Runtime/build-time content originates from the repository `skills/` tree referenced by `resolve.ts` and `manifest.macro.ts`.
