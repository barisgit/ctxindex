# Extension Loading Specification

## Purpose
Define trusted Extension loading, validation, compiled-binary compatibility, and degraded behavior when an Extension is unavailable.

## Requirements

### Requirement: Explicit-path trusted Extension loading
For V1, the system SHALL load trusted external TypeScript or JavaScript Extensions from explicit local paths by in-process dynamic import as specified by this Extension loading contract. External Extensions MUST use public definition contracts, MUST NOT import ctxindex runtime code, and SHALL receive runtime facilities only through host-provided capability contexts.

#### Scenario: External TypeScript Extension loads by explicit path
- **WHEN** configuration names a valid trusted external `.ts` Extension path
- **THEN** the system imports, validates, and activates its definitions in-process

#### Scenario: Undeclared discovery is not required
- **WHEN** an Extension exists only in an auto-discovery, git, or package-registry location
- **THEN** V1 does not need to discover or install it unless its local path is explicitly configured

### Requirement: Atomic validation and capability consistency
For V1, core SHALL validate an Extension as a unit before activation, including definition schemas, id uniqueness, supported Profile bindings, and consistency between Adapter capability or Action declarations and implementations as required by this Extension validation contract. An invalid Extension MUST be rejected whole with a diagnostic.

#### Scenario: Missing capability implementation rejects Extension
- **WHEN** an Adapter declares `retrieve` but provides no retrieve implementation
- **THEN** the containing Extension is rejected before any of its definitions activate

#### Scenario: Extra Action implementation rejects Extension
- **WHEN** an Adapter implements an Action not declared by one of its supported Profiles
- **THEN** the containing Extension is rejected with a capability-consistency diagnostic

### Requirement: Compiled binary loads external TypeScript
For V1, the compiled Bun binary SHALL load explicit-path external TypeScript Extensions while running outside the project tree. The project MUST remain pinned to Bun 1.3.14, and `scripts/spikes/d3-compiled-extension/run.sh` SHALL pass.

#### Scenario: Relocated binary loads an external Extension
- **WHEN** `scripts/spikes/d3-compiled-extension/run.sh` runs a relocated compiled binary from outside the repository against an external TypeScript Extension with its own dependencies
- **THEN** the Extension loads successfully under Bun 1.3.14

### Requirement: Missing Extension preserves materialized data
For V1, removing or failing to load an Extension SHALL make its Sources unavailable for sync and provider operations while preserving their locally synced Resources as specified by this degraded Extension loading contract. Extension absence MUST NOT delete data; deletion requires an explicit Source removal or purge operation.

#### Scenario: Removed Extension degrades to local envelope search
- **WHEN** a previously active Extension is no longer available
- **THEN** its Sources remain listed as unavailable and their synced Resources remain locally searchable with envelope-level degradation where vocabulary is missing

### Requirement: External Extension proves the public seam
For V1, at least one external tenders Extension SHALL load outside the compiled binary and exercise the same public Profile, Adapter, and Extension contracts as bundled definitions.

#### Scenario: Tenders Extension participates through generic operations
- **WHEN** the external tenders Extension is loaded from its configured path
- **THEN** its definitions appear in registries and its Resources can be served through generic ctxindex operations without bundled-only hooks

### Requirement: Adapter capabilities and normalized operations
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

An adapter declares a set of boolean capability flags: `sync`, `search-remote`, `retrieve`, `download`, plus an Action implementation map keyed by Profile Action id. Declaring a capability or Action REQUIRES implementing it; omitting it FORBIDS it:

- `sync` — cursor-driven generator emitting resource upsert/tombstone/cursor operations;
- `search-remote` — translate a ctxindex query to the provider's search API, returning envelope-level results with refs;
- `retrieve` — fetch one complete resource by ref;
- `download` — stream one artifact's bytes by artifact ref into the managed store.
- Action implementation — validate and execute one Profile-declared mutation through a Source, returning the declared normalized output.

An adapter MUST NOT implement an Action that no supported Profile declares. Core MUST validate capability and Action consistency when building registries. Action support is source-discoverable and is not a license for arbitrary Extension CLI commands.

Search routing mode is NOT a capability. Routing precedence is: CLI flag (`--local-only` / `--remote`) over per-source configuration over adapter decision. The default is hybrid orchestration in which each source answers per its adapter's routing choice, which SHOULD consult sync coverage.

#### Scenario: Declared Adapter capabilities match implemented operations
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

### Requirement: Extension definitions and degraded loading
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

Extensions are TS/JS modules loaded in-process by dynamic import, running with full trust (documented prominently). Definitions are plain versioned objects produced by pure factories (`defineExtension`, `defineAdapter`, `defineProfile`); binding between SDK descriptors and runtime behavior is by `(id, version)`, never object identity. Extensions MUST NOT import ctxindex runtime code; runtime values (schema library, logger, authorized fetch, secrets, artifact sink) arrive via host-provided context objects. Core MUST validate loaded definitions at runtime (schema, id uniqueness, capability/operation consistency) before activation; an invalid extension is rejected whole with a diagnostic.

When an extension is removed or fails to load, its sources become unavailable (listed; no sync; no remote operations) but their synced resources REMAIN searchable, degrading to envelope-level behavior where profile vocabulary is missing. Removing extension code MUST NOT silently delete data; explicit source removal/purge commands are the only deletion paths.

The CLI's generic verbs MUST derive their argument space from the registries: valid kinds from profile ids and declared aliases, valid `--field` names and value types from profile field declarations, adapter config flags from config schemas, OAuth providers/scopes from Adapter auth declarations, export formats from profile export maps, and Actions/input schemas from Profile declarations plus Adapter bindings. Parallel hand-maintained command or alias declarations MUST NOT exist.

#### Scenario: Extension loading validates definitions and preserves data on absence
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings
