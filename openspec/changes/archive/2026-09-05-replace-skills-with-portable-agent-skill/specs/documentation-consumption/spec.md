## ADDED Requirements

### Requirement: Exact portable Agent Skill retrieval
The CLI SHALL expose `docs get-skill [--output <path>] [--format text|json]` for the one release-bundled ctxindex Agent Skill. Text retrieval MUST write the exact canonical `SKILL.md` bytes to stdout. JSON retrieval MUST return deterministic safe metadata, parsed `name` and `description`, and the exact complete content. `--output` MUST use exclusive, owner-private copy behavior and MUST NOT replace an existing path.

Retrieval MUST use only bytes embedded at CLI build time and MUST perform no Extension loading, daemon selection, provider I/O, package acquisition, browser launch, or network access. The relocated compiled CLI MUST return bytes identical to the canonical source file.

#### Scenario: Agent prints the portable skill
- **WHEN** an agent invokes `ctxindex docs get-skill`
- **THEN** stdout is byte-for-byte equal to the release's canonical `skills/ctxindex/SKILL.md`

#### Scenario: Agent copies the portable skill
- **WHEN** an agent invokes `ctxindex docs get-skill --output <new-path>`
- **THEN** the command creates that file privately with exact bundled bytes and refuses to replace an existing path

#### Scenario: Relocated executable retrieves the skill offline
- **WHEN** a packaged executable is relocated without the source checkout or network
- **THEN** `ctxindex docs get-skill` returns the embedded canonical skill unchanged
