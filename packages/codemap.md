# packages/

## Responsibility

Contains reusable workspace libraries defining ctxindex's provider-neutral domain/runtime services, extension contract, Profiles, and built-in Google, Microsoft, and filesystem Adapters.

## Design/patterns

- Layered packages: `extension-sdk` defines contracts; `profiles` supplies declarative domain vocabularies; `adapters` performs provider/filesystem I/O; `core` validates definitions and owns services, commit-pinned trusted Git Catalog provenance and offline loading, persistence, orchestration, configuration, search, and typed secret routing.
- Explicit TypeScript export maps and repository verification enforce package dependency direction and truthful direct manifests.
- Provider composition remains outside core: adapters bundle Google Calendar, Gmail, Microsoft Calendar, Microsoft Outlook mailbox, and local-directory definitions against provider-neutral SDK/Profile contracts; both calendar Adapters implement the shared calendar-event Profile, while Gmail and Outlook implement the communication Profile's reversible Draft create/update Actions.

## Data & control flow

1. Profiles and Adapters are authored against `@ctxindex/extension-sdk` and bundled as Extensions.
2. Core loads and validates definitions and OAuth declarations, persists provider-scoped client records, maintains one stable Grant per Account, and dispatches Source, authorization, search, sync, retrieval, Artifact, and Action operations through SDK contexts; indexed Calendar handlers sync and retrieve normalized events, while provider-owned Draft handlers perform one create or update mutation and return canonical Resources without exposing send.
3. Adapter outputs flow through core validation and resource/relation/artifact/search services into SQLite where workflows require local persistence; remote-search cache batches coordinate concurrent processes through SQLite and preserve provider results when optional materialization exhausts its bound.
4. Core configuration, secrets, paths, networking, logging, and migrations surround those workflows; declared environment keys are one-time OAuth client inputs while runtime refresh uses Grant-owned typed secret references.

## Integration points

| Package | Integration role | Detailed map |
| --- | --- | --- |
| `packages/extension-sdk/` | Shared contracts for definitions, contexts, emissions, and operations. | `packages/extension-sdk/codemap.md` |
| `packages/profiles/` | Provider-neutral calendar-event, communication-message, and file vocabularies. | `packages/profiles/codemap.md` |
| `packages/adapters/` | Built-in Google, Microsoft, and local-directory provider integrations. | `packages/adapters/codemap.md` |
| `packages/core/` | Provider-neutral services, registries, SQLite storage/schema, operation pipelines, and runtime infrastructure. | `packages/core/codemap.md` |

- `apps/cli/` is the primary workspace consumer; external extensions consume the SDK boundary.
