## Capability Implementation Targets

- `documentation-consumption` → `openspec/specs/documentation-consumption/implementation.md`
- `extension-documentation` → `openspec/specs/extension-documentation/implementation.md`

## Module Ownership

Core documentation continues to own source adaptation, safe passive-item validation, exact selection, bounded search, and deterministic ordering. `@ctxindex/rpc` owns only strict transport DTO schemas and the schema-first documentation procedure family. `apps/daemon` adapts its already-loaded `DocumentationProjection` into the core `DocumentationService` once during startup and projects operation results through RPC. `apps/cli/src/docs` owns runtime selection, composition with the embedded bundled source, result formatting, and explicit asset output. The RPC package never imports Extension loading or core business logic.

## Interfaces and Data Flow

`DaemonRpcApplication` derives a `documentation` family from the oRPC contract with `list`, `get`, and `search` methods. `DaemonApplicationOptions` receives a read-only `Pick<DocumentationService, 'list' | 'get' | 'search'>`; startup constructs it from the exact `LoadExtensionsResult.documentation` retained beside the daemon registry. The application maps core `DocumentationItem` and `DocumentationSearchResult` values into strict RPC values and validates each complete result before success.

The CLI documentation command service may return synchronous local results or asynchronous daemon results. Its default loader calls `selectDaemon()` exactly once. A null selection creates the existing combined local service after one direct definition load. A selected runtime creates a routed service: bundled get remains local, Extension get calls RPC, and list/search combine local bundled results with daemon Extension results using stable origin/id/path ordering. RPC errors retain the existing declared-error mapping and no selected call enters the direct loader.

RPC inventory items omit `content`. Exact text results carry `content`; exact assets carry `contentBase64`. The CLI converts accepted RPC values back into the existing core public item shape before formatting or atomic output copying.

## Storage and State

No durable state is added. The daemon documentation service is an in-memory read-only view over the immutable projection created during startup. The CLI stores no remote documentation cache and makes no daemon result authoritative beyond one invocation.

## Security and Compatibility

RPC documentation inputs bound Extension ids, logical paths, and queries by UTF-8 bytes. Outputs use strict closed unions, bounded row counts, exact media enums, bounded title/summary/snippet/text, and canonical bounded Base64 with matching decoded size. The daemon reuses core terminal-control validation and converts any schema failure to `result_too_large`. Safe values contain logical identity only and exclude source/materialization paths, module/file URLs, executable definitions, schema objects, callbacks, diagnostics, provider data, and secrets.

This is a pre-alpha protocol addition with no compatibility alias or version negotiation change. The existing exact runtime/protocol middleware applies to every documentation procedure.

## Verification

Schema tests cover strict keys, byte/count bounds, canonical Base64, and content omission from inventory/search. Router tests prove contract-derived application typing, compatibility middleware, and exact one-call delegation. Daemon application tests prove immutable service projection, lifecycle admission, content encoding, and `result_too_large` handling. Runtime tests prove startup passes the exact loaded projection into the application. CLI tests prove direct mode, selected-daemon routing, bundled-only get, deterministic composition, binary decoding, and no fallback after daemon failure. Package typecheck, architecture gates, full CI, and strict OpenSpec validation remain required.

## Promotion Notes

- Merge the CLI route-once, local-bundle/daemon-Extension composition, asynchronous command-service seam, and fail-closed selection doctrine into `openspec/specs/documentation-consumption/implementation.md`.
- Merge the daemon-owned core documentation service, schema-first list/get/search RPC family, strict wire DTO/base64 representation, bounds, and no-path/no-executable projection doctrine into `openspec/specs/extension-documentation/implementation.md`.
