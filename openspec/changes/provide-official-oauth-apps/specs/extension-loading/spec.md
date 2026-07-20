## MODIFIED Requirements

### Requirement: All origins share one activation path
Built-in, explicit-path, and installed Catalog Extensions MUST use the same factories, root collector, graph collector, conservative duplicate/conflict policy, complete-registry validation, and atomic activation. Manifest-backed explicit-path and Catalog packages MUST additionally use the same declared-entry resolver. An already acquired bundled module namespace MAY enter directly at the namespace root collector, but no origin MAY bypass collection/validation, pre-register or preselect roots/leaves, shadow by priority, or win by load order.

The exact same imported non-App definition object MAY coalesce when encountered repeatedly. Distinct same-identity values containing any function or Zod schema MUST conflict. Distinct genuinely pure declarative values MAY coalesce only through canonical structural equality. OAuth App duplicates MUST always conflict. Separate physical SDK/Zod copies remain valid authoring inputs, but their executable/schema-bearing definitions MUST NOT coalesce from matching version, integrity, commit, path, provenance, source text, or `Function#toString`. Root provenance MUST NOT participate in leaf identity, equivalence, conflict, or winner selection. It MAY be retained for diagnostics and matched separately against immutable host release policy solely to decide whether one already valid active OAuth App is eligible for managed-default selection. Conflicts MUST reject atomically.

#### Scenario: Built-in uses common activation after distribution
- **WHEN** a bundled module namespace is already available
- **THEN** its exported roots still pass through the common collectors and complete-registry validator

#### Scenario: Independent executable copies conflict in either order
- **WHEN** separate materialized packages contribute distinct same-id definitions containing functions or Zod schemas and are loaded in either order
- **THEN** activation rejects in both orders without treating matching provenance or function text as equivalence

#### Scenario: Independent SDK copies remain collectable
- **WHEN** an entry authored with another physical SDK/Zod copy exports a structurally valid non-conflicting Extension
- **THEN** discriminator-based collection and validation accept it without `instanceof` or physical-copy identity checks

#### Scenario: Managed eligibility does not choose a registry winner
- **WHEN** retained provenance matches a managed-App host policy
- **THEN** matching occurs only after duplicate-free atomic activation and cannot change leaf identity, equivalence, conflict, or winner selection

## ADDED Requirements

### Requirement: Extension provenance supports host managed-App policy
The active registry MUST retain enough safe immutable provenance for core to match an OAuth App to a host-owned managed-App release policy. The policy MUST identify exact `(providerId,label)`, owning Extension identity, and one accepted distribution provenance supported by the integrated acquisition model. Built-in and external Extensions MUST still use the same public SDK factories, graph collection, validation, and activation path.

Managed authority MUST NOT be accepted from Extension exports, OAuth App config, Provider registration, package or Catalog manifests, environment, user config, load order, package name alone, client id, or ordinary execution/install trust. A provenance mismatch MUST make only managed-default selection unavailable; a valid unreviewed Extension App MUST remain usable through explicit `--app` and MUST NOT be rejected merely for containing public registration metadata.

#### Scenario: Exact bundled provenance matches policy
- **WHEN** an active App's identity, owning Extension, and bundled package provenance exactly match host release policy
- **THEN** core may select its exact label as the managed default

#### Scenario: External App uses identical authoring path
- **WHEN** a valid npm, Git, local, path, or Catalog Extension contributes an OAuth App
- **THEN** it enters the ordinary graph and registry path and remains explicitly selectable regardless of managed designation

#### Scenario: Copied public id grants no priority
- **WHEN** an unreviewed Extension App config contains the same public client id as a managed App
- **THEN** the copied value grants no managed status, priority, scope, host, or other authority

#### Scenario: Unsupported provenance cannot be approximated
- **WHEN** host policy names a distribution provenance the integrated loader cannot verify exactly
- **THEN** managed-default resolution treats it as unavailable rather than trusting partial package, path, version, or repository similarity
