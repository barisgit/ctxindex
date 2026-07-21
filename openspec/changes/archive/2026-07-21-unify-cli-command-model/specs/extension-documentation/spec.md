## MODIFIED Requirements

### Requirement: Projection is transport-neutral and browser-safe by contract
Core SHALL expose one deterministic transport-neutral documentation projection consumed by the CLI documentation surface and suitable for future agent and local-web consumers. The CLI consumer SHALL emit Markdown as inert text or JSON, SHALL copy verified assets only to an explicit output path, and SHALL NOT interpret Markdown as terminal control, HTML, or executable content. Any browser consumer MUST sanitize rendered Markdown independently, disable raw HTML and script/event attributes, reject unsafe URL schemes, and prevent network-loaded media even after core validation.

#### Scenario: CLI retrieves validated Markdown
- **WHEN** the CLI retrieves a loaded Extension Markdown document
- **THEN** it emits the portable string without rendering HTML or resolving remote content

#### Scenario: Future browser renders validated Markdown
- **WHEN** a future local browser surface renders a projected Markdown document
- **THEN** it applies browser-side sanitization and does not treat core validation as trusted HTML
