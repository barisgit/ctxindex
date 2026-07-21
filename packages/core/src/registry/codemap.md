# packages/core/src/registry/

## Responsibility

Builds the complete, provenance-preserving registry from collected Extension roots; validates and indexes the reachable Provider, OAuth App, Profile, and Adapter values; and supplies the legacy registry projection and stable CLI descriptions.

## Design/patterns

- `complete-registry.ts` is the authoritative validator and indexer. `buildCompleteCandidateRegistry()` coalesces identical Extension root definitions while retaining every root provenance, includes exact explicitly listed leaves plus Provider/Profile leaves transitively referenced by Adapters, Actions, and OAuth Apps, builds sorted maps, and rejects semantic conflicts. It does not deduplicate OAuth Apps: any App encountered under a root carrying multiple provenances rejects as a duplicate. Despite `collectExtensionGraph()`'s historical name, it traverses already collected definition values only and performs no module or dependency traversal.
- `definition-id.ts` owns the shared bounded, lowercase route-safe grammar for Extension, Provider, Profile, and Adapter ids so registry identity and documentation routes use one injective representation.
- Collected roots may carry an already resolved documentation tree beside the stripped runtime definition. Registry identity and equivalence ignore that sidecar; `packages/core/src/extension/documentation.ts` validates and projects it separately.
- `definition-registries.ts` adapts that complete registry into `ProfileRegistry`, `AdapterRegistry`, and the legacy `ExtensionRegistry`; rebuilding on `ExtensionRegistry.register()` preserves atomic revalidation for callers that still use the legacy surface.
- `profile-registry.ts` implements the `id@version` keyed Profile view, including Zod boundary validation of search hooks, duplicate detection, kind resolution, and degraded unknown-version warnings.
- Complete-registry validation enforces strict runtime definition shapes, including Adapter routing, capabilities, function-valued operations/Actions, access scopes, and Provider host arrays, plus Provider/OAuth App policy, Profile/Action contracts, and unique OAuth App identities. Extension App config recursively rejects typed secret references, and schema failures collapse to safe Provider/App identity diagnostics. An OAuth App conflicts with a locally configured BYOA identity, another root, or the exact same App/root contributed under multiple provenances.
- `AdapterRegistry.getOAuthProvider()` exposes the provider-neutral OAuth2 lookup used by auth; `describe.ts` projects the complete legacy views into deterministic presentation-neutral descriptions.

## Data & control flow

1. The extension loader or legacy constructor provides complete Extension roots. `buildCompleteCandidateRegistry()` validates roots, coalesces identical root definitions that share an ID while retaining every provenance record, visits exact explicitly listed leaves, and follows Provider/Profile values referenced by already collected Adapters, Actions, and OAuth Apps without traversing modules or package dependencies. If that coalesced root contributes any OAuth App, multiple root provenances reject rather than deduplicating the App.
2. It merges those values by stable identity, rejects conflicting duplicates, validates cross-profile Actions and Adapter bindings, then returns sorted `extensions`, `providers`, `oauthApps`, `profiles`, `adapters`, and `provenances` maps as `CompleteRegistry`.
3. `ExtensionRegistry` derives legacy Profile and Adapter views from the complete registry; consumers call `get()`, `list()`, `resolve()`, or `resolveKind()`, with unknown Profile versions optionally reported through `ProfileRegistryOptions.onWarning`.
4. `describeRegistry()` sorts registry entries, converts Adapter config, Action input, and Provider registration Zod schemas with `z.toJSONSchema()`, derives Adapter config flags, and returns kinds/sources/actions metadata. Source descriptions preserve the complete safe Provider auth vocabulary and sorted API hosts so JSON output and readable CLI renderers can generate OAuth setup guidance entirely from registry declarations without exposing runtime schema internals.

## Integration points

- Definition types come from `@ctxindex/extension-sdk`; validation and description schemas use `zod`.
- `packages/core/src/extension/loader.ts` supplies collected roots and consumes `CompleteRegistry`; `definition-registries.ts` is the compatibility adapter for existing callers. `packages/core/src/source/`, `search/`, `resource/`, and `action/` consume registry lookups.
- `apps/cli/src/definitions.ts`, `apps/cli/src/commands/describe.ts`, and `apps/cli/src/commands/source.ts` consume registry construction/descriptions.
- `index.ts` is the canonical capability Interface and the direct target of the `@ctxindex/core/registry` package subpath.
