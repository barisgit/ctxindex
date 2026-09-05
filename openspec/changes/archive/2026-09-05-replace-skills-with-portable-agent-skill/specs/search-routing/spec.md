## REMOVED Requirements

### Requirement: Skills teach enumeration and pagination
**Reason:** The generic bundled-skills subsystem and its `getting-started` and `reference/cli-overview` documents are removed. The one portable Agent Skill intentionally stays concise and directs agents to live documentation and help instead of duplicating detailed search pagination workflows.

**Migration:** Agents discover enumeration and pagination behavior through `ctxindex docs search "pagination" --format json`, exact product documentation retrieval, and generated `ctxindex search --help`. Search runtime behavior and machine-readable pagination fields are unchanged.
