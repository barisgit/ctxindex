# ctxindex bundled skills

This directory contains concise agent orientation shipped with ctxindex. Bundled skills explain what ctxindex is, when it is useful, and where to discover the installed interface; they do not duplicate command trees, provider setup, loaded vocabulary, or workflow logic.

The running CLI is authoritative. Use `ctxindex --help` for the current command surface, `ctxindex describe` and exact-definition JSON output for loaded vocabulary, `ctxindex extensions list` for active Extensions, `ctxindex skills list` to discover bundled orientation, and `ctxindex skills get <name>` to read one skill.

Repository contributor guidance lives in [`.agents/skills/repo-development/SKILL.md`](../.agents/skills/repo-development/SKILL.md). The normative bundled-skills contract lives in [`openspec/specs/cli-surface/spec.md`](../openspec/specs/cli-surface/spec.md).
