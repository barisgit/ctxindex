## MODIFIED Requirements

### Requirement: CLI and core module boundaries
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

The CLI is the sole agent-facing integration surface. CLI command entrypoints MUST limit themselves to parsing and validating arguments, invoking a declared application service boundary, formatting the result, mapping typed errors, and returning an exit code. For behavior assigned to the local daemon, that service boundary MUST invoke the daemon rather than compose the runtime or open storage in the CLI process.

The local daemon MUST be the application composition root for daemon-routed behavior. It MUST compose the provider-neutral runtime, storage, loaded Extension registry, and all daemon use-case orchestration, while provider-neutral business rules remain owned by core services and Source Adapters.

The separate private `@ctxindex/rpc` package MUST define a pure oRPC contract with `@orpc/contract` that owns exact bounded input, plain success output, and declared error schemas plus schema-derived types. Its router factory MUST use `implement(contract)` and contain only the narrow injected `DaemonRpcApplication` interface, exactly-once delegation, result-to-declared-error adaptation, and compatibility/cross-cutting middleware. Each handler MUST validate input, delegate exactly once, validate/serialize the plain success or declared error data, and MUST NOT implement use-case/business logic, inspect core error classes, select/iterate Sources, retry, access storage/providers/filesystem lifecycle, load Extensions, parse/format CLI data, or map exits. Compatibility expectations MUST be injected into router construction and middleware MUST NOT call an application method as hidden delegation. Bun HTTP/Unix-socket adapters MUST remain outside the package.

The injected application boundary MUST be recursively derived from the contract's inferred input/output tree and MUST NOT repeat a handwritten signature for every procedure. Failure declarations and validation MUST derive from one authoritative registry and MUST NOT maintain a second error alias map or handwritten failure-kind switch.

The separate private `@ctxindex/local-daemon` infrastructure package MAY be imported by daemon and CLI and MUST own only canonical config/data/state/cache and SQLite-path resolution, safe identity digests, endpoint discovery metadata, and retained exclusive/shared file-lease primitives. It MUST NOT contain RPC procedures/DTOs, oRPC/Bun HTTP adapters, database composition, application orchestration, core/provider/Extension behavior, CLI formatting, or exit mapping. The CLI MUST NOT import the daemon application.

CLI implementation code MUST NOT import `bun:sqlite` or `drizzle-orm/*`. It MUST NOT contain raw SQL literals for `INSERT`, `UPDATE`, `DELETE`, or `SELECT` statements.

CLI implementation code MUST NOT issue `fetch()` calls to provider APIs such as OAuth, Google, or Microsoft endpoints. Provider HTTP behavior belongs in provider-neutral core services or Source Adapters.

CLI implementation code MUST NOT generate ULIDs or UUIDs and MUST NOT encode schema column names. Identity assignment and schema knowledge are core concerns.

The OAuth host flow MAY bind a loopback-only socket and explicitly open a browser. State, callback, timeout, PKCE, token exchange, provider identity, and secret persistence MUST be owned by a provider-neutral core service; the CLI only selects definitions and invokes the declared application service boundary.

#### Scenario: Daemon-routed CLI command
- **WHEN** the CLI invokes behavior assigned to the local daemon
- **THEN** the CLI validates input and delegates a typed request without composing the runtime, opening storage, or implementing business behavior
- **THEN** the daemon-owned application service executes the same provider-neutral core behavior used by an in-process caller

#### Scenario: RPC procedure delegates without business logic
- **WHEN** an RPC procedure receives a valid typed request
- **THEN** its `implement(contract)` handler delegates exactly once to `DaemonRpcApplication`, validates/serializes a plain success or throws a declared typed error, and returns without applying use-case/domain policy, formatting CLI output, or selecting an exit code

#### Scenario: Pure contract owns the wire shape
- **WHEN** a client or future generator consumes the daemon contract
- **THEN** it can infer every procedure path, input, plain success output, and declared error without importing handlers or daemon application code

#### Scenario: Application shape follows the contract
- **WHEN** a procedure is added, removed, or changes input/output in the pure contract
- **THEN** the recursive injected application type changes with it without updating another procedure signature declaration

#### Scenario: Compatibility middleware does not hide a second delegation
- **WHEN** compatibility middleware checks a request
- **THEN** it uses immutable router expectations and does not invoke health or any other application method

#### Scenario: CLI and daemon share infrastructure without application coupling
- **WHEN** CLI discovers an endpoint or acquires a retained shared database lease and daemon acquires exclusive leases
- **THEN** both use `@ctxindex/local-daemon`, while CLI does not import `apps/daemon` and `@ctxindex/rpc` contains no lifecycle/filesystem implementation
