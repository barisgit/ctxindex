# packages/core/src/testing/

## Responsibility

Provides reusable test infrastructure: a black-box CLI sandbox plus a provider-neutral OAuth provider fixture.

## Design/patterns

- `createSandbox()` is a test-fixture factory returning the `Sandbox` interface rather than exposing setup details.
- Environment isolation redirects config, data, cache, and state through `CTXINDEX_*_HOME` variables under one temporary directory and always points `CTXINDEX_KEYTAR_MOCK_FILE` at a sandbox-local file.
- `run()` wraps `Bun.spawn` for the repository CLI entrypoint and captures exit code, stdout, stderr, and elapsed time as `SandboxRunResult`.
- `cleanup()` is idempotent through a closure-scoped `cleaned` flag.
- `oauth-provider.ts` exports `testOAuthProvider()` with deterministic endpoints, hosts, PKCE/client/environment policy, scopes, and identity mappings for core tests.

## Data & control flow

1. `createSandbox()` allocates `ctxindex-sandbox-*` under the OS temp directory, builds isolated environment paths plus a file-backed Keychain mock, and preserves `PATH` when present; spawned CLI tests therefore cannot reach the user's native Keychain.
2. `sandbox.run(args, opts)` launches `bun apps/cli/bin/ctxindex.mjs ...args`, merges per-run environment overrides, converts string stdin to a `Blob`, and reads both output streams concurrently with process exit.
3. The caller inspects the captured result and calls `cleanup()`, which recursively removes the sandbox exactly once.

## Integration points

- Uses Bun process/stream APIs and Node filesystem/path/URL utilities; the CLI path is resolved relative to `packages/core/src/testing/sandbox.ts`.
- `index.ts` re-exports the sandbox and OAuth provider fixture from the `@ctxindex/core/testing` package subpath for repository consumers.
- The harness exercises the real `apps/cli/bin/ctxindex.mjs` entrypoint without importing CLI internals.
