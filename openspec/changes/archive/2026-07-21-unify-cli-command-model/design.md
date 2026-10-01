## Context

ctxindex exposes a non-interactive CLI to both humans and shell-capable agents. The current command tree is declared with Citty, but handlers ignore Citty's parsed values and invoke separate hand-written parsers over `rawArgs`. Help, runtime validation, usage strings, tests, bundled skills, and web reference pages therefore encode the same grammar independently. The divergence is already user-visible on the pending Extension surface and will become a compatibility burden after the first release.

Citty 0.2.2 already supplies typed parsed arguments, required positionals and options, enum validation, defaults, aliases, dynamic argument definitions, and usage rendering. It intentionally accepts unknown options and its public usage renderer sees only one parent command. Those are bounded framework gaps; they do not justify replacing the dependency.

Core already exposes a validated, portable Extension documentation projection. The web app already owns authored product documentation and processed text for LLM routes. The missing layer is a deterministic consumer and a build-time bundle, not another documentation model.

## Goals / Non-Goals

**Goals:**

- Make one declarative command tree sufficient to understand and execute the complete CLI.
- Preserve stable exit codes, non-interactive behavior, thin CLI ownership, dynamic Adapter options, and deterministic JSON.
- Remove command levels and overloads that do not communicate distinct concepts.
- Expose comprehensive authored documentation offline without confusing it with generated registry truth or executable skills.
- Generate one compact web CLI reference from the same command tree.

**Non-Goals:**

- Provider-specific commands or workflow orchestration.
- Backward-compatible aliases before the first release.
- A runtime dependency on ctxindex.com, Next.js, Fumadocs, or a local daemon.
- Rendering Markdown as trusted HTML in the CLI.
- Replacing the accepted Extension, Catalog, documentation, or installation architecture.

## Decisions

### Keep Citty and remove the parallel parser layer

Every public command is declared once through a ctxindex wrapper around Citty's `defineCommand`. Handlers consume Citty's typed `args`, never `rawArgs`. The wrapper generically checks raw tokens against the same resolved argument definitions for unknown options, duplicate non-repeatable options, malformed values, and surplus positionals before delegating. Citty continues to own required-value, enum, alias, default, command-selection, and base usage behavior.

A generic tree walker resolves the full command path for help and supplies Citty's renderer with the complete parent name. The ctxindex wrapper appends root-only discovery guidance and exposes a serializable command-reference projection. No command-specific help renderer or handwritten usage string remains.

Alternatives rejected:

- Keeping both layers and testing for equality still preserves two sources of truth.
- Replacing Citty with Commander, Yargs, or another framework would broaden the change while the installed framework already covers the required type and help model.
- Using only `node:util.parseArgs` would require rebuilding command nesting, help, aliases, enums, and lifecycle hooks ourselves.

### Use a uniform Extension lifecycle grammar

The singular `extension` group owns loaded inventory, Catalog lifecycle, and installed lifecycle. Installation always names an exact source kind, source target, and stable Extension id:

```text
ctxindex extension install <catalog|npm|git|local> <target> <extension-id>
```

For `catalog`, target is the configured Catalog name. For package kinds, target is the requested package target. The command itself is the explicit code-execution trust grant for every kind and emits the trust notice before acquisition; `--trust` remains required only where a command could otherwise appear inert while importing author code or trusting a repository (`catalog add` and `catalog build`). Catalog reads live under `extension catalog`, including search.

`extension update <id>` follows persisted provenance. Direct records reacquire their stored target; Catalog-curated records refresh their recorded configured Catalog and reinstall the same stable id. The command never changes origin, target, Catalog identity, or stable id.

### Collapse only objectively redundant command levels

`thread` directly accepts a Resource Ref because it has exactly one operation. Artifact cache removal joins `artifact list` and `artifact download` as `artifact purge`. Source-aware Action inspection becomes `describe action <id> --source <source>` while `action` retains only mutation execution. Other command groups remain intact until a separate user-visible need justifies change.

### Treat docs, skills, and generated descriptions as different products

- `describe` reports authoritative loaded schemas and capability facts.
- `skills` provides short imperative agent workflows.
- `docs` provides comprehensive authored explanation and examples.

`docs list|get|search` composes a build-time bundled product-documentation tree with the already-loaded Extension documentation projection. Bundled content is extracted deterministically from the canonical authored documentation during the CLI package build; the executable has no web runtime dependency. Search is a bounded case-insensitive textual match with deterministic ordering, not a ranking service or network lookup.

Markdown is emitted as text. Image assets are inventory items and may only be copied through an explicit output path; the CLI never writes raw image bytes to a terminal. JSON identifies origin, Extension id when applicable, logical path, title/summary when available, content kind, media type, and safe size without source or managed paths.

### Generate one secondary CLI reference

The web documentation keeps one generated CLI page rather than one handwritten page per command. A repository generator walks the resolved command tree and emits stable Markdown from command metadata. A freshness test fails when the checked-in projection differs. Usage guides link to relevant generated anchors but remain task-oriented prose.

## Risks / Trade-offs

- [Breaking command names invalidate current examples] -> Update bundled skills, web docs, README, fixtures, shell examples, and compiled E2E coverage atomically; retain no hidden aliases in pre-alpha.
- [Generic strict validation may differ from legacy diagnostics] -> Preserve stable exit categories rather than exact prose, add malformed-zero-side-effect tests, and make all diagnostics name the full command path.
- [Citty nested help has only one-parent context] -> Supply the full resolved prefix generically to Citty's renderer rather than forking or replacing the library.
- [Bundling comprehensive docs grows the executable] -> Apply deterministic file/count/byte bounds and exclude generated CLI reference and web-only presentation assets from the runtime bundle.
- [Catalog update performs network and code execution] -> Require the explicit update command, emit the same trust notice as install, refresh only the recorded Catalog, and preserve the prior runnable record on any failure.
- [A generated reference can become a large navigation distraction] -> Keep it as one secondary page and make `--help` the primary command-discovery surface.

## Migration Plan

No persistent data migration is required. Existing direct and Catalog-curated generic installation records already contain the provenance needed by origin-aware update. The implementation changes commands, bundled guidance, generated docs, and tests together, then validates a relocated compiled binary. Because no public release exists, removed command forms fail as ordinary invalid usage and no compatibility aliases are added.

## Open Questions

None.
