# packages/core/src/action/

## Responsibility

Application service for discovering and executing typed profile Actions against a configured Source, then materializing adapter results as Resources.

## Design/patterns

- `describeAction()` in `describe.ts` joins the registry-level Action declaration with per-Source adapter availability; unavailable bindings are classified as `adapter_unavailable` or `action_unsupported`.
- `runAction()` in `run.ts` is a validation-and-dispatch pipeline: Zod validates adapter output, profile schemas validate payloads, and explicit confirmation gates irreversible Actions.
- Profile definitions own Action input/output contracts; adapters provide Source-specific `actions[actionId]` bindings. `index.ts` is the leaf barrel.

## Data & control flow

1. `describeAction()` resolves `actionId` through `describeRegistry()`, queries Source adapter coordinates from SQLite, and reports whether each registered adapter exposes the Action.
2. `runAction()` resolves the declaring profile, validates `actionInput`, checks effect confirmation, and loads the Source's adapter binding.
3. `createSourceProviderContext()` supplies authenticated provider dependencies; `binding.run()` performs provider I/O.
4. The returned Ref, Source ownership, output profile, and payload are validated before `ResourceStore.upsert()` persists a complete `adhoc` Resource; the stored Resource and profile warnings are returned.

## Integration points

- Registry contracts: `packages/core/src/registry/` (`ExtensionRegistry`, `describeRegistry`, profile and adapter registries).
- Provider execution: `packages/core/src/source/provider-context.ts`.
- Persistence and identity validation: `packages/core/src/resource/resource-store.ts`, `packages/core/src/ref/`, and `packages/core/src/storage/`.
- Public exports: `packages/core/src/action/index.ts`; consumed by higher-level command/application entry points through the core package.
