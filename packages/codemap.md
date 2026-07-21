# packages/

## Responsibility

Contains reusable workspace libraries defining ctxindex's provider-neutral domain/runtime services, local RPC contracts and daemon infrastructure, extension contract, Profiles, and built-in Google, Microsoft, and filesystem Adapters.

## Design/patterns

- Layered packages: `extension-sdk` defines plain Provider/Profile/Adapter/OAuth App/Extension values, package-backed Catalog authoring contracts, and operation contracts; `profiles` supplies ordinary domain libraries; `adapters` performs provider/filesystem I/O; `core` collects and validates complete definition graphs and owns Catalog snapshot generation/acquisition, unified installation, services, persistence, orchestration, and typed secret routing.
- `rpc` is a composition-only wire boundary: it owns bounded schemas, compatibility middleware, router shape, and the generated client type, but no transport, application behavior, filesystem coordination, or provider logic.
- `local-daemon` is infrastructure-only: it owns canonical runtime identity, Unix-socket discovery/endpoint metadata, and retained lifecycle/database leases without depending on RPC, core storage, or applications.
- Explicit TypeScript export maps and repository verification enforce package dependency direction and truthful direct manifests.
- Provider composition remains outside core: adapters bundle Google Calendar, Gmail, Microsoft Calendar, Microsoft Outlook mailbox, and local-directory definitions against provider-neutral SDK/Profile contracts; both calendar Adapters implement the shared calendar-event Profile, while Gmail and Outlook implement the communication Profile's reversible standalone/reply Draft create/update Actions.

## Data & control flow

1. Ordinary Profiles, Providers, Adapters, and OAuth Apps are authored against `@ctxindex/extension-sdk`; Extensions compose exact imported values without versions, refs, or dependencies. Catalog definitions curate literal Extensions or exact npm/Git/local package descriptors for trusted build-time resolution.
2. Core emits replay-locked Catalog snapshots and routes Catalog-curated and direct packages through one content-addressed installation store. Runtime loading verifies unified records offline, collects exact exported roots/reachable leaves, validates one complete registry, combines Extension and local OAuth Apps, and may match an exact bundled App against host-owned managed policy. Explicit App selection bypasses policy; either path snapshots selected App config into one stable private Grant per Account and dispatches Source and provider operations through SDK contexts.
3. Adapter outputs flow through core validation and resource/relation/artifact/search services into SQLite where workflows require local persistence; remote-search cache batches coordinate concurrent processes through SQLite and preserve provider results when optional materialization exhausts its bound.
4. Core configuration, secrets, paths, networking, logging, and migrations surround those workflows; Provider-declared registration environment keys are one-time local OAuth App inputs while runtime refresh uses Grant-owned App snapshots and token references.
5. CLI and daemon composition choose direct or RPC execution outside core. Direct clients retain shared database ownership; the daemon retains exclusive ownership and projects core application-service results through `rpc`, while `local-daemon` keeps identity, discovery, and locking independent of both behaviors.

## Integration points

| Package | Integration role | Detailed map |
| --- | --- | --- |
| `packages/extension-sdk/` | Shared contracts for definitions, Catalog curation, contexts, emissions, and operations. | `packages/extension-sdk/codemap.md` |
| `packages/profiles/` | Provider-neutral calendar-event, communication-message, and file vocabularies. | `packages/profiles/codemap.md` |
| `packages/official/` | Built-in Google, Microsoft, and local-directory provider integrations. | `packages/official/codemap.md` |
| `packages/core/` | Provider-neutral services, registries, SQLite storage/schema, operation pipelines, and runtime infrastructure. | `packages/core/codemap.md` |
| `packages/rpc/` | Bounded local-daemon DTO schemas, compatibility middleware, router contract, and typed client surface. | `packages/rpc/codemap.md` |
| `packages/local-daemon/` | Runtime identity, secure discovery/endpoint metadata, and retained filesystem lease infrastructure. | `packages/local-daemon/codemap.md` |

- Each package manifest owns its build, quality, test, and clean/fullclean tasks. `apps/cli/` and `apps/daemon/` compose the private packages; external extensions consume only the SDK boundary.
