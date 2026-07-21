# examples/issues-extension/

## Responsibility

Provides a compact, mechanically checked provider-backed Extension package for public SDK documentation. The private ESM workspace package advertises `extension.ts` through `ctxindex.extensions` and composes one issue Profile, OAuth Provider, public App, scoped remote-search Adapter, Extension root, and passive documentation tree.

## Design

- `extension.ts` imports only the public `@ctxindex/extension-sdk` authoring surface in production code.
- `issueSchema` and the provider response schema are strict; `issueProfile` derives searchable title, occurrence time, and typed state.
- `projectProvider` owns OAuth endpoints, public registration schema/environment mapping, base identity scopes, PKCE, and allowed hosts. All example endpoints use the reserved `.invalid` domain.
- `desktopApp` binds one non-secret fixture client id to the exact Provider under Provider-scoped label `desktop`.
- `issueAdapter` imports exact Provider/Profile values, adds only `issues.read`, permits only the provider API host, and implements `search-remote` with validated Source config/provider JSON and cancellation propagation.
- `docs/` supplies the required index plus canonical Adapter and versioned Profile documents through `docs('./docs')`.

## Flow

1. Package entry resolution imports `./extension.ts`, collects the default `example.issues` root, binds its documentation descriptor, and reaches exact App, Provider, Adapter, and Profile leaves.
2. Account authorization combines Provider base scopes with compatible Adapter-specific access; App config and Grant state remain outside public Extension inventory.
3. Remote search receives host-scoped `context.fetch`, validates the configured project and provider response, and emits bounded `example.issue@1` Resource results with Source-scoped Refs and optional continuation.
4. Focused tests inject a deterministic fetch fixture, verify normalized output, and exercise real package entry/documentation discovery without provider egress.

## Integration

- Declares `@ctxindex/extension-sdk` as the only production workspace dependency and `@ctxindex/core` only for manifest-discovery tests.
- Exports Provider ID `example.projects`, Profile identity `example.issue@1`, Adapter ID `example.issues`, OAuth App identity `(example.projects, desktop)`, and Extension ID `example.issues`.
- Serves as the checked source behind the public provider-backed SDK quickstart under `apps/web/content/docs/extend/`.
