# Getting started with ctxindex

ctxindex is a local personal-context gateway for agents. Use it when you need to discover, retrieve, or materialize context across configured Sources and Realms, or invoke a typed provider Action through the same deterministic CLI.

The installed CLI's live help and loaded definitions are authoritative. Start with:

- `ctxindex --help` for the current command surface and command-specific help.
- `ctxindex describe` for the compact index of loaded Profiles, Adapters, and Actions.
- `ctxindex describe <profile|adapter|action> <id> --json` for one exact loaded definition and its available vocabulary.
- `ctxindex extensions list` for the Extensions active in this installation.
- `ctxindex skills list` to discover bundled orientation and `ctxindex skills get <name>` to read one skill.

Prefer these live surfaces over copied command lists, schemas, or provider-specific instructions: they reflect the installed ctxindex release and its loaded Extensions.
