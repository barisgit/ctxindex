## Capability Implementation Targets

- `sync-operations` → `openspec/specs/sync-operations/implementation.md`

## Module Ownership

This change introduces no durable production implementation doctrine. The replay runner, fixtures, provider drivers, and assertions remain owned by the CLI end-to-end test lane; existing Adapter mocks remain provider-owned test infrastructure. Production dependency direction is unchanged.

## Interfaces and Data Flow

No public or production-internal interface changes. A test-local provider driver supplies mock lifecycle effects to one test-local shared runner, which invokes the existing CLI sandbox and reads persisted evidence through read-only test queries.

## Storage and State

Production storage ownership is unchanged. Each replay owns one temporary isolated XDG state directory, while every CLI command runs as a separate process. Provider mock state is ephemeral and exists only for the test duration.

## Security and Compatibility

Fixtures are invented and use `.test` identities. Mock request records remain redacted, the replay allows only expected read routes, and no live credentials, provider data, write route, schema migration, compatibility alias, or additional dependency is introduced. The test runs on the repository-pinned Bun version.

## Verification

The focused gate runs the provider sync replay e2e test. The affected Slice gate runs the CLI e2e lane containing the replay, followed by repository CI and strict OpenSpec validation. OpenSpec verification maps the replay assertions to the added evidence requirement.

## Promotion Notes

No doctrine must be promoted into `openspec/specs/sync-operations/implementation.md`: the change adds acceptance evidence only and does not establish a durable production interface, ownership boundary, or implementation rule.
