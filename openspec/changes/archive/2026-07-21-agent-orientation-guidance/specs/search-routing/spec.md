## REMOVED Requirements

### Requirement: Skills teach enumeration and pagination
**Reason:** Bundled skills are now an orientation layer and must not duplicate workflow details that belong to the running CLI's generated help and registry-derived interface.

**Migration:** Agents use `ctxindex --help` and command-specific live help to discover current search and pagination syntax; the search behavior itself is unchanged.
