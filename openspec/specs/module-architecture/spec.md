# module-architecture Specification

## Purpose
TBD - created by archiving change deepen-module-architecture. Update Purpose after archive.
## Requirements
### Requirement: Implementation follows explicit module ownership
The repository MUST organize implementation by the domain owner of the behavior, as detailed by the capability `implementation.md` sidecars under `openspec/specs/`, and MUST keep composition roots free of provider-specific schemas and operation implementations.

#### Scenario: Built-in Source Adapter locality
- **WHEN** a maintainer inspects a built-in Source Adapter
- **THEN** its definition, configuration, operations, provider helpers, and focused tests are located in that Adapter-owned module
- **THEN** the built-in Extension composition root only bundles Profile and Adapter definitions

### Requirement: Internal reorganization preserves public seams
Architecture cleanup MUST preserve declared package subpath names, the public Extension SDK value/type surface and authoring inference, CLI behavior and exit codes, storage schema, and provider request behavior unless a separate capability change explicitly modifies them. Unreachable symbols in private workspace packages MAY be removed.

#### Scenario: Existing consumers after reorganization
- **WHEN** workspace packages, the CLI, and an external compiled Extension use their declared public imports and workflows
- **THEN** they compile and behave identically without importing internal implementation paths

### Requirement: Architecture checks cover owned entrypoints
Automated verification MUST discover and validate all production CLI command entrypoints and MUST enforce the repository's package dependency direction and Adapter composition locality without a hand-maintained exception list.

#### Scenario: New production command or Adapter implementation
- **WHEN** a production CLI command or built-in Adapter implementation is added
- **THEN** architecture verification includes it automatically
- **THEN** a misplaced implementation or an oversized command composition module fails verification

### Requirement: Runtime code and manifests contain no dormant prototype surface
Production modules and runtime dependency manifests MUST exclude unreachable prototype contracts, compatibility-only aliases, and dependencies unused by that package's runtime or tests.

#### Scenario: Repository health verification
- **WHEN** the architecture and package gates run
- **THEN** no unreachable prototype sync-operation implementation, forbidden Adapter-table cleanup path, dead provider client surface, or unused direct runtime dependency remains

### Requirement: CLI and core module boundaries
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

`apps/cli` is a thin shell around `@ctxindex/core` services. Command files under `apps/cli/src/commands/**/*.ts` MUST limit themselves to parsing arguments, calling a core service, formatting the result, mapping typed errors, and returning an exit code.

Code under `apps/cli/src/**` MUST NOT import `bun:sqlite` or `drizzle-orm/*`. It MUST NOT contain raw SQL literals for `INSERT`, `UPDATE`, `DELETE`, or `SELECT` statements.

Code under `apps/cli/src/**` MUST NOT issue `fetch()` calls to provider APIs such as OAuth, Google, or Microsoft endpoints. Provider HTTP behavior belongs in `@ctxindex/core` or `@ctxindex/adapters`.

Code under `apps/cli/src/**` MUST NOT generate ULIDs or UUIDs and MUST NOT encode schema column names. Identity assignment and schema knowledge are core concerns.

The OAuth host flow MAY bind a loopback-only socket and explicitly open a browser. State, callback, timeout, PKCE, token exchange, provider identity, and secret persistence MUST be owned by a provider-neutral `@ctxindex/core/auth` module; the CLI only selects definitions and invokes that module.

#### Scenario: CLI commands delegate runtime behavior to core services
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings
