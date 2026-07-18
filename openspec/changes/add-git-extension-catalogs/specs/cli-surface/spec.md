## ADDED Requirements

### Requirement: Deterministic Git Catalog command surface
The CLI SHALL provide `extensions catalog add <name> <repository> --ref <full-ref-or-oid> --trust`, Catalog `list`, `show`, `refresh`, and `remove`, `extensions install <catalog> <id>@<version> --trust`, and `extensions uninstall <id>@<version>`. Text and JSON output MUST be deterministic and business behavior MUST be delegated to provider-neutral core.

#### Scenario: Catalog lifecycle is requested as JSON
- **WHEN** an agent invokes a supported Catalog inspection or mutation command with `--json`
- **THEN** the CLI emits a deterministic machine-readable result containing exact persisted provenance and no prompts

#### Scenario: Exact extension selector is invalid
- **WHEN** an install, uninstall, or show selector does not contain a valid exact `<id>@<version>`
- **THEN** the CLI returns a usage error with exit code 2 before service mutation

### Requirement: Separate trust acknowledgements
Catalog add MUST require repository trust acknowledgement and Extension install MUST independently require execution trust acknowledgement. Missing either required `--trust` MUST fail with exit code 2 before repository access, dynamic import, or persisted mutation.

#### Scenario: Install trust is omitted after Catalog trust
- **WHEN** a Catalog is registered but install is invoked without `--trust`
- **THEN** install fails with exit code 2 without loading Extension code or changing installed provenance

### Requirement: Relocated compiled Catalog workflow
The compiled Bun CLI SHALL acquire and install a Catalog Extension from an absolute local Git fixture, then load and list it after the executable and ctxindex state are relocated outside the repository tree.

#### Scenario: Relocated compiled CLI loads installed provenance
- **WHEN** the compiled Catalog end-to-end test runs from outside the project tree against a local committed Git fixture
- **THEN** add, install, and offline Extension listing succeed without project-local runtime imports or network access
