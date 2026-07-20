# packages/

## Responsibility

Contains reusable workspace libraries defining ctxindex's provider-neutral domain/runtime services, extension contract, Profiles, and built-in Google, Microsoft, and filesystem Adapters.

## Design/patterns

- Layered packages: `extension-sdk` defines plain Provider/Profile/Adapter/OAuth App/Extension values and operation contracts; `profiles` supplies ordinary domain libraries; `adapters` performs provider/filesystem I/O; `core` collects and validates complete definition graphs and owns services, persistence, orchestration, and typed secret routing.
- Explicit TypeScript export maps and repository verification enforce package dependency direction and truthful direct manifests.
- Provider composition remains outside core: adapters bundle Google Calendar, Gmail, Microsoft Calendar, Microsoft Outlook mailbox, and local-directory definitions against provider-neutral SDK/Profile contracts; both calendar Adapters implement the shared calendar-event Profile, while Gmail and Outlook implement the communication Profile's reversible standalone/reply Draft create/update Actions.

## Data & control flow

1. Ordinary Profiles, Providers, Adapters, and OAuth Apps are authored against `@ctxindex/extension-sdk`; Extensions compose exact imported values without versions, refs, or dependencies.
2. Core resolves package entries, collects exported roots/reachable leaves, validates one complete registry, combines Extension and local OAuth Apps, snapshots selected App config into one stable private Grant per Account, and dispatches Source and provider operations through SDK contexts.
3. Adapter outputs flow through core validation and resource/relation/artifact/search services into SQLite where workflows require local persistence; remote-search cache batches coordinate concurrent processes through SQLite and preserve provider results when optional materialization exhausts its bound.
4. Core configuration, secrets, paths, networking, logging, and migrations surround those workflows; Provider-declared registration environment keys are one-time local OAuth App inputs while runtime refresh uses Grant-owned App snapshots and token references.

## Integration points

| Package | Integration role | Detailed map |
| --- | --- | --- |
| `packages/extension-sdk/` | Shared contracts for definitions, contexts, emissions, and operations. | `packages/extension-sdk/codemap.md` |
| `packages/profiles/` | Provider-neutral calendar-event, communication-message, and file vocabularies. | `packages/profiles/codemap.md` |
| `packages/adapters/` | Built-in Google, Microsoft, and local-directory provider integrations. | `packages/adapters/codemap.md` |
| `packages/core/` | Provider-neutral services, registries, SQLite storage/schema, operation pipelines, and runtime infrastructure. | `packages/core/codemap.md` |

- Each package manifest owns its build, quality, test, and clean/fullclean tasks; root Turbo commands dispatch them across the workspace. `apps/cli/` is the primary workspace consumer, while external extensions consume the SDK boundary.
