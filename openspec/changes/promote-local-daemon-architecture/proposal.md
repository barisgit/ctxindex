## Why

The accepted local-daemon prototype proved that one long-lived process can safely own SQLite, runtime composition, and an immutable Extension registry while the CLI preserves its public behavior over a bounded typed RPC contract. The Human checkpoint selected `promote`. The repository now needs to turn that proof into normal product behavior without preserving a permanent split where some stateful commands use the daemon and others fail while it is running.

## What Changes

- Promote local daemon ownership from an explicitly partial prototype to the normal runtime architecture for stateful CLI behavior.
- Migrate every remaining SQLite- or runtime-owning command family to a semantic daemon application procedure, or document a narrow bootstrap/filesystem-only exception that cannot race the daemon-owned database or active registry.
- Replace prototype-only failure wording and unsupported-command behavior with production lifecycle, availability, compatibility, and ownership contracts while preserving stable CLI exits and output shapes.
- Canonicalize persisted relative Extension paths independently of the daemon's launch directory before the long-lived registry loads them.
- Establish supported-platform policy and portable retained ownership semantics instead of silently treating Darwin lock constants as a cross-platform implementation.
- Add canonical implementation sidecars for the accepted RPC, daemon, CLI-client, storage-ownership, and immutable-registry boundaries.
- Keep service installation/autostart, local-client authentication beyond owner-private local transport, backup automation, remote access, batching, OpenAPI/SDK publication, background scheduling, and queues as separately specified operational changes. This promotion defines seams and prerequisites for them but does not silently bundle them into the architecture migration.

## Capabilities

### New Capabilities

- `local-daemon`: Canonical local process ownership, lifecycle, compatibility, cancellation, request admission, shutdown, and supported-platform behavior.

### Modified Capabilities

- `module-architecture`: Make the contract-first RPC package, daemon application composition, shared lifecycle infrastructure, and thin CLI client normal ownership boundaries.
- `cli-surface`: Route all stateful runtime behavior through semantic daemon procedures while preserving the CLI as the sole agent-facing surface and defining narrow bootstrap exceptions.
- `error-taxonomy`: Remove prototype-only classification while retaining bounded transport failures and CLI-owned stable exit mapping.
- `generic-storage`: Make retained single-daemon database ownership the normal production rule on every supported platform.
- `extension-loading`: Canonicalize persisted Extension paths and make one immutable registry lifetime normal daemon behavior.
- `oauth-client-management`: Move local OAuth App inventory and mutation behind daemon-owned application services with one bounded write-only sensitive input and no secret exposure in results, diagnostics, or logs.
- `account-grant-management`: Move authorization, reauthorization, inventory, and removal behind daemon-owned application services while keeping browser interaction explicit and local.
- `secret-backend-operations`: Move secret-backend inventory and switching behind daemon-owned application services without exposing secret values in RPC.
- `retrieval-and-artifacts`: Move descriptor listing, managed-byte transfer coordination, export, and purge bookkeeping behind daemon ownership without embedding bytes in ordinary RPC values.
- `extension-catalogs`: Coordinate installed-Extension activation changes with daemon registry lifetime and database-backed OAuth App identity validation.
- `provider-actions`: Execute Action description and invocation through the daemon-owned active registry and runtime.

## Impact

- Extends `@ctxindex/rpc`, `apps/daemon`, and the CLI daemon client across the remaining stateful application surfaces; business behavior remains in core and Source Adapters.
- Replaces direct runtime composition and prototype fencing for normal commands with one daemon-owned runtime, while retaining only explicitly safe bootstrap or filesystem-only paths.
- Adds canonical implementation doctrine beside affected capability specs and updates the readable system projection after implementation.
- Requires platform-specific retained-lease implementations and multi-process acceptance coverage for every supported operating system.
- Changes local process lifecycle and Extension path persistence, but does not change provider schemas, provider permissions, stored domain schema, public agent integration, or the private status of the RPC protocol.
