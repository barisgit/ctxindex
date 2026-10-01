## Capability Implementation Targets

- `cli-surface` → `openspec/specs/cli-surface/implementation.md`
- `documentation-consumption` → `openspec/specs/documentation-consumption/implementation.md`
- `search-routing` → `openspec/specs/search-routing/implementation.md`

## Module Ownership

The repository `skills/ctxindex/SKILL.md` owns the portable agent-facing orientation. The CLI docs module owns retrieval, formatting, and explicit file copying. A build-time macro may read and validate the canonical skill, while runtime code consumes only the embedded immutable value. The generic CLI skills module and command ownership are removed.

## Interfaces and Data Flow

`docs get-skill` is a filesystem- and daemon-independent leaf command. Its command definition parses output selection, then a narrow handler reads an immutable embedded skill value, emits exact text or deterministic JSON, or delegates to the docs module's safe exclusive-copy primitive. Build-time validation parses the bounded YAML frontmatter and rejects a missing/extra metadata field, invalid UTF-8, or an empty body before packaging.

The skill remains distinct from core Documentation Tree values and Extension documentation RPC. It does not enter DocumentationService list/search/get composition and never triggers Extension loading or daemon routing.

## Storage and State

No durable application state is introduced. Explicit `--output` creates one owner-private file through temporary-file plus exclusive-link semantics and never overwrites an existing path.

## Security and Compatibility

The command reads no secrets and performs no egress or provider work. Output metadata contains only the skill name, description, byte size, and content. Removal of the pre-alpha generic skills group is intentional and has no compatibility shim.

## Verification

Focused command tests compare text and copied output against the canonical file, assert JSON metadata/content, verify overwrite refusal, and prove no service loader runs. Command-model/no-prompt tests prove parsing and removal behavior. A relocated compiled-package test proves exact embedded bytes without the checkout. Generated CLI reference, thin-CLI, architecture, full CI, integration/e2e, and strict OpenSpec validation remain cross-cutting gates.

## Promotion Notes

- `openspec/specs/cli-surface/implementation.md`: Record canonical one-file skill ownership, build-time embedding/validation, and removal of the generic skill registry module.
- `openspec/specs/documentation-consumption/implementation.md`: Record `docs get-skill` as a local immutable leaf outside DocumentationService and Extension/daemon documentation composition, reusing the safe explicit-copy boundary.
- `openspec/specs/search-routing/implementation.md`: No promotion is needed; retiring skill-owned pagination prose does not change search module ownership, interfaces, or verification doctrine.
