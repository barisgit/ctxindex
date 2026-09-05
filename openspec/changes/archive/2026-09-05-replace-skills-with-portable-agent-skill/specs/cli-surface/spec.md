## MODIFIED Requirements

### Requirement: Bundled skills surface
ctxindex MUST ship exactly one portable Agent Skill from the canonical `skills/ctxindex/SKILL.md` source. The file MUST contain YAML frontmatter with exactly the agent-facing `name` and `description` fields followed by a concise Markdown body. The description MUST explain that ctxindex is a local personal-context gateway for configured mail, calendars, files, and Extension-defined Sources and identify the operations for which an agent should use it.

The body MUST direct agents to live installed discovery rather than duplicate loaded kinds, fields, Source options, formats, Action schemas, or provider-specific instructions. It MUST include between three and six authoritative `docs`, `describe`, or help commands and one programmatic composition example that checks command success before consuming machine-readable output. It MUST NOT claim that third-party Extension Actions are limited to the official Extensions' mutation policy.

The skill bytes MUST be versioned with and embedded in the CLI release. The CLI MUST NOT expose a generic `skills` command group, skill registry, skill installation workflow, or compatibility alias.

#### Scenario: Agent retrieves concise orientation
- **WHEN** an agent retrieves the bundled ctxindex skill
- **THEN** it receives one standard `SKILL.md` that explains the product, teaches live discovery, and includes one programmatic composition without copied loaded vocabulary

#### Scenario: Extension Action policy remains extension-defined
- **WHEN** the skill describes Actions available through ctxindex
- **THEN** it directs the agent to loaded Action declarations without claiming that every Extension is limited to reversible official-provider mutations

#### Scenario: Removed generic skills command is invoked
- **WHEN** a caller invokes `ctxindex skills`, `ctxindex skills list`, `ctxindex skills get`, or `ctxindex skills path`
- **THEN** parsing rejects the removed command before application, provider, or network effects

#### Scenario: Bundled skills use exact OAuth App workflow
- **WHEN** the skill body touches Account authorization
- **THEN** it points at live `docs` and command help using OAuth App and Account vocabulary and never teaches Client or public Grant concepts or copies provider-specific credential steps

#### Scenario: Extension documentation is not implicit skill content
- **WHEN** a loaded Extension contributes a passive documentation sidecar
- **THEN** the current bundled skills surface does not expose or inline that sidecar without a separately accepted consumer contract
