## MODIFIED Requirements

### Requirement: Bundled skills surface
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

ctxindex SHOULD ship bundled skill documentation alongside the binary so agents can discover when and why to use ctxindex without external docs. The skills surface SHOULD provide at least:

- a list command that prints bundled skill names and summaries, with machine-readable JSON output;
- a get command that prints one skill's content, with machine-readable JSON output and an option to inline all referenced docs;
- a path command that prints where bundled skills live.

Bundled skill docs MUST be versioned with the ctxindex release that ships them.

Shipped bundled skill prose MUST be concise orientation only. It MUST explain what ctxindex is and when an agent should use it, and MUST direct the agent to live discovery through `ctxindex --help`, `ctxindex describe`, exact-definition `ctxindex describe <profile|adapter|action> <id> --json`, `ctxindex extensions list`, `ctxindex skills list`, and `ctxindex skills get <name>`.

The running CLI's generated help and loaded-definition discovery output MUST be authoritative for the available command surface and for kinds, fields, filters, formats, Actions, and adapter flags. Shipped bundled skills MUST NOT duplicate a static root command inventory, provider credential or setup instructions, Profile field inventories, or Action schemas.

#### Scenario: Bundled skills orient an agent through live discovery
- **WHEN** an agent reads a bundled skill from the installed release
- **THEN** it can decide whether ctxindex fits the context task and is directed to the live help, loaded definition, Extension, and skill discovery surfaces without relying on a static command or schema reference

#### Scenario: Skills API remains stable after static reference removal
- **WHEN** an agent uses `skills list`, `skills get`, or `skills path`, including the supported `--json` and `--inline` options
- **THEN** those commands and options retain their existing behavior even when a skill has no referenced document to inline
