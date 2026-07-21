# ctxindex Agent Skill

[`ctxindex/SKILL.md`](ctxindex/SKILL.md) is the portable Agent Skill embedded in every `ctxindex` release. It teaches shell-capable agents to discover the installed interface, search configured context, and follow opaque Resource Refs without duplicating Extension schemas or provider instructions.

```sh
ctxindex docs get-skill
ctxindex docs get-skill --output ./SKILL.md
```

Repository development guidance lives in [`.agents/skills/repo-development/SKILL.md`](../.agents/skills/repo-development/SKILL.md). CLI behavior is specified in [`openspec/specs/cli-surface/spec.md`](../openspec/specs/cli-surface/spec.md).
