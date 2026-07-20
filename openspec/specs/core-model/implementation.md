# Core Model Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Definition graph

Extension definitions are shallow plain values with stable kind discriminators. Extension roots compose exact imported Adapters and OAuth Apps plus optional standalone Providers and Profiles. Collection follows the imported values transitively; package manifests and TypeScript imports own dependency acquisition, and core exposes no reference factories or Extension dependency graph.

Provider, Profile, Adapter, and Extension semantic keys are their declared ids, with Profile version included where required. OAuth App identity is `(providerId,label)`. Object identity may terminate graph traversal and recognize exact non-App reuse, but it is never a semantic key, precedence rule, or duplicate winner.

## Complete registry

```ts
export interface DefinitionProvenance {
  readonly origin: 'builtin' | 'explicit-path' | 'catalog'
  readonly packageName?: string
  readonly packageVersion?: string
  readonly integrity?: string
  readonly commit?: string
  readonly entry: string
  readonly exportName: string
}

export interface CompleteRegistry {
  readonly extensions: ReadonlyMap<string, AnyExtensionDefinition>
  readonly providers: ReadonlyMap<string, AnyProviderDefinition>
  readonly oauthApps: ReadonlyMap<string, AnyOAuthAppDefinition>
  readonly profiles: ReadonlyMap<string, AnyProfileDefinition>
  readonly adapters: ReadonlyMap<string, AnyAdapterDefinition>
  readonly provenances: ReadonlyMap<string, readonly DefinitionProvenance[]>
}
```

Candidate construction validates complete selected graphs without mutating active state. OAuth App duplicates always conflict. Exact reused non-App objects may coalesce. Distinct same-identity values containing functions or Zod schemas conflict. Distinct pure declarative values may coalesce only when canonical structural equality proves equality. Provenance is retained for diagnostics and may be consumed separately by host managed-App policy after activation; it never participates in leaf identity, equivalence, conflict, or winner selection.

Separate physical SDK and Zod copies remain valid authoring inputs through structural validation. `instanceof`, load order, origin priority, physical location, package metadata, source text, and function text do not establish identity or equivalence.

## Domain ownership

Providers own direct `oauth2` or `none` authentication, identity discovery, OAuth App schema and registration policy, endpoints, base scopes, and authorization hosts. Provider-backed Adapters import exactly one Provider and own only Adapter access, operation scopes, Provider API hosts, capabilities, operations, Actions, and exact Profile bindings. Providerless Adapters omit Provider, Account, Grant, auth, Provider access, and Provider egress state.

OAuth Apps bind one exact imported OAuth2 Provider. Accounts use one exact App label supplied explicitly or resolved from host managed-App policy before the ordinary exact App resolver. Grants are private and own the selected App configuration snapshot and token references. Public inventory and configuration do not expose Grant selectors or state.

`@ctxindex/profiles` remains an ordinary private workspace library. Provider, Profile, Adapter, and OAuth App values contain no embedded documentation contract. An Extension root may carry one pure directory or virtual-tree declaration; core resolves and validates it, strips it from runtime definition identity, and exposes authored and generated entries through a separate passive list/get projection.

## Verification

SDK type fixtures cover exact imported-value inference and reject reference, dependency, documentation, and providerless authorization escape hatches. Registry tests cover reachable leaves, duplicate policy, physical-copy compatibility, Providerless behavior, OAuth App collisions, provenance-only diagnostics, and atomic activation.
