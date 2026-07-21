# ctxindex

**Give any shell-capable agent one local, typed interface to your email, calendars, files, and extension-defined context.**

ctxindex turns provider-specific data into searchable Resources with stable `ctx://` references. Agents use the same deterministic CLI across Gmail, Outlook, Google Calendar, Microsoft Calendar, local files, and Extensions—without an MCP server or agent-specific integration.

- **Local-first:** configuration, credentials, indexes, and cached content stay on your machine.
- **Agent-ready:** compact JSON, low-token text, stable exit codes, and discoverable schemas.
- **Extensible:** add Providers, Profiles, Adapters, Actions, and documentation through the type-safe Extension SDK.

## Quick start

ctxindex requires Bun 1.3.14 and is published as [`ctxindex`](https://www.npmjs.com/package/ctxindex).

```sh
bun add --global ctxindex
ctxindex init

ctxindex realm add work --name "Work"
ctxindex account add microsoft --label work
ctxindex source add microsoft.mailbox \
  --realm work \
  --account work \
  --label work-mail

ctxindex sync --source work-mail --format json
ctxindex search "quarterly planning" --source work-mail --format json
ctxindex get '<ref from results[0].ref>' --format json
```

`account add` opens the provider authorization flow. If the bundled managed OAuth App is unavailable for your identity or organization, follow the [bring-your-own-app setup](https://ctxindex.com/docs/start/connect-provider).

The returned Ref is opaque: pass it unchanged to `get`, `thread`, `export`, or a typed Action. Use `--format json` for structured agent workflows, `--format text` for lower token usage, and `ctxindex <command> --help` as the exact CLI reference.

## What agents can do

```sh
# Search across every configured Source
ctxindex search "renewal notice" --kind mail.message --format json

# Inspect the loaded, extension-aware interface
ctxindex describe --full --format json

# Retrieve a complete Resource and its related thread
ctxindex get '<ctx://ref>' --format json
ctxindex thread '<ctx://ref>' --format json

# Inspect a typed Action before invoking it
ctxindex describe action mail.message.draft.create \
  --source work-mail \
  --format json
```

Provider mutations currently stop at reversible email Draft creation and update. ctxindex never sends email.

## Extensions

Built-in functionality uses the same SDK as external Extensions. Start with the public examples and demo Extensions in [`barisgit/ctxindex-extensions`](https://github.com/barisgit/ctxindex-extensions), then see the [Extension SDK guide](https://ctxindex.com/docs/extend) for provider-backed and providerless designs, Profiles, Adapters, Actions, documentation, packaging, and publishing.

## How I used Codex and GPT-5.6 for OpenAI Build Week

For OpenAI Build Week, I used GPT-5.6 first in Pi and later in Codex to build and harden the submitted version of ctxindex. I want to keep that distinction clear rather than describing the earlier Pi work as Codex work.

In Codex, I kept one large thread open as a meta-session. I used the root agent to plan the work, make product and architecture decisions, and review what came back. Focused subagents handled specific implementation, testing, research, and review tasks in parallel. This was especially useful for changes that crossed the CLI, daemon, core, provider adapters, and Extension SDK.

I made the main product decisions in that root session: keep provider data canonical, use the CLI as the agent interface, make Extensions the way new context is added, and stop provider mutations at reversible email Drafts. Codex helped turn those decisions into implementation and tests without losing the boundaries between packages.

Codex's browser and computer tools also helped with the less glamorous part of the project: navigating Google Cloud Console and Microsoft Entra while setting up and checking real OAuth applications.

ctxindex had an early foundation before OpenAI Build Week. The public commit history and dated Pi and Codex sessions show what was added and changed during the submission period.

## Documentation

- [Start with ctxindex](https://ctxindex.com/docs)
- [Connect Google or Microsoft](https://ctxindex.com/docs/start/connect-provider)
- [Use ctxindex from an agent](https://ctxindex.com/docs/start/agent-usage)
- [Mail workflows](https://ctxindex.com/docs/use/mail) and [calendar workflows](https://ctxindex.com/docs/use/calendar)
- [Trust and local data](https://ctxindex.com/docs/use/trust)
- [Contributing](CONTRIBUTING.md)

## Development

```sh
bun install --frozen-lockfile
bun cli --help
bun ci
bun test:integration
bun test:e2e
```

ctxindex is licensed under the [MIT License](LICENSE).
