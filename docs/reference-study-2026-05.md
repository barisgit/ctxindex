# Reference study — 2026-05

> Historical prototype research. References to “V1” below mean an abandoned
> prototype plan, not the current V1 scope. This document is non-normative.


Status: non-normative. Authored to feed the next charter (cli-and-e2e + loopback OAuth) and to seed targeted amendments in `V1.md` / `SPEC.md` / `IMPLEMENTATION.md`. The earlier `docs/reference-study.md` stays in force for adapter-contract and indexer patterns; this study covers monorepo / env / test infrastructure.

## Cross-cutting findings

### Turborepo

1. **Per-workspace `turbo.json` extending `//` with explicit `env:` arrays per task**. Each app declares the env vars whose change should invalidate its cache. ctxindex `turbo.json` currently has zero env tracking — adopt this so cached test/build results don't lie when `CTXINDEX_*` envs change.
2. **`globalDependencies: ['**/.env', '**/.env.*']`** at root. Any `.env` file change busts all caches. Cheap insurance.
3. **Two `typecheck` lanes**: a fast per-package `check-types` (no `^build` dep) and a strict `type-check` that depends on `^build`. ctxindex has one combined `typecheck` task; splitting helps when packages start emitting `.d.ts`.
4. **`build:packages` filter pattern**: `turbo build --filter=@repo/**` builds only internal packages before `turbo watch dev --filter=<app>`. Useful when ctxindex grows beyond cli + core + adapters.

### Env handling

5. **Two viable schools**: one is a T3-style env package with Zod schemas split into `server` / `client` / `shared`, a Proxy-based read-only env object, and `createEnv()` with `skipValidation` for build tools; the other is a Bun-native `getEnv()` singleton with `resetEnvForTests()` and a single `EnvSchema` with `passthrough()`. For ctxindex (single CLI binary, no client), the singleton model is the better fit — keep one schema in `@ctxindex/core` with explicit `CTXINDEX_*` keys and a `resetEnvForTests()` hook.
6. **`.env.example` is the canonical documented source** with structured comment sections per concern (paths, OAuth, secrets, logs). `.env` and `.env.*` are gitignored except `.env.example`. Currently ctxindex has `.envrc` (direnv) but no `.env.example`.
7. **`sync-env.ts` script**: reads root `.env`, validates against each app's Zod schema, writes per-app `.env.local` with `MISSING` comments for absent vars. Less relevant for a single-app monorepo but worth keeping as a pattern for when ctxindex grows a daemon/web companion.
8. **`env://VAR_NAME` URI scheme inside config files**. Lets `config.toml` say `[secrets.gmail] client_secret = "env://CTXINDEX_GMAIL_CLIENT_SECRET"` and resolve at load time. Cleaner than inline `${VAR}` substitution. Worth adopting in ctxindex's TOML loader as an alternative to `keychain:` and `file:` refs already specified in SPEC §7.

### Test infrastructure

9. **`bunfig.toml` test defaults** with `pathIgnorePatterns` and per-lane scripts: `test` (unit-only via ignore), `test:integration`, `test:all`. ctxindex already uses `bun test` but has no formal lane split.
10. **`with-timeout.ts` wall-clock guard**. Spawns child detached, kills process group on timeout, exits `124` (GNU timeout semantics). `TEST_WALL_TIMEOUT_SECS` env override. Critical for CI lanes that may hang on a network mock. Adopt as `scripts/with-timeout.ts`.
11. **JUnit XML reporter + slowest-test finder**. `bun test --reporter=junit --reporter-outfile=.cache/bun-junit.xml` + a `scripts/junit-slowest.ts` that parses XML and surfaces top-N. Optional but high-leverage for catching flaky/slow integration tests.
12. **Shared test data factories** + per-process **template-DB rehydration**. Migrate a template DB once per process, snapshot it, and clone per test — gives O(ms) test setup with a real schema. For ctxindex SQLite this maps to "open a temp DB, run migrations once, snapshot the file, copy on each `createTestDb()` call".
13. **Dedicated test-harness module**. Centralizes mock factories, helpers, and sandbox setup. ctxindex equivalent: `packages/core/src/testing/` with `createSandbox()` returning `{ envOverrides, paths, db, cleanup }`.
14. **`webServer`-style auto-spawn block** (Playwright pattern). For ctxindex this maps to "binary-first e2e harness spawns `bun apps/cli/bin/ctxindex.mjs` with sandboxed XDG envs and asserts stdout/stderr/SQLite state".

### Lint / format / typecheck

15. **Biome single-tool stack** — ctxindex already does this. The ESLint+Prettier alternative pairs `eslint-plugin-only-warn` (warnings locally) with `--max-warnings 0` in CI; not needed since Biome is already integrated.
16. **`tsgo` (`@typescript/native-preview`) over `tsc`**. ctxindex already uses tsgo per IMPLEMENTATION §3c.
17. **`noUncheckedIndexedAccess: true`** universal. ctxindex already has this in `tsconfig.base.json`. Worth also enabling `noImplicitOverride`, `strictFunctionTypes`, `noUnusedLocals`, `noUnusedParameters` to match the strictest reference set.
18. **lint-staged + husky pre-commit** with per-package `--filter` deduction. ctxindex has neither. Optional for a v1 CLI but reduces drift.

### CLI patterns

19. **citty** — ctxindex already uses it. Help-flag handling is opt-in per command; ctxindex's `apps/cli/src/main.ts` was just patched to handle `--help` at the subcommand level. Worth matching the pattern where every `defineCommand` declares args with `type: 'positional' | 'string' | 'boolean'` so citty handles help automatically.
20. **Exit-code discipline**: `1` for validation errors, `2` for usage errors, `124` for wall-clock timeouts. ctxindex SPEC §12 already locks `10/20/30/40/50/130`; adopt `2` for usage errors and `124` for the e2e harness's `with-timeout` wrapper.

### Worktree + sandbox

21. **`worktree-new.sh`** that provisions isolated git worktree with port allocation, generates `.env.local`, runs `bun install`. ctxindex has `.envrc` per worktree (direnv-driven) but no allocator script. Defer — the existing direnv approach is fine for v1.

## Recommendations for ctxindex

Ranked by adoption cost vs payoff for the next charter (cli-and-e2e + loopback OAuth).

### Adopt now (this study's amendments to V1/SPEC/IMPLEMENTATION)

1. **Per-workspace `turbo.json` env declarations** (cost: low, payoff: high). Each app/package declares `env:` arrays so cache invalidates on relevant env change.
2. **`globalDependencies: ['**/.env', '**/.env.*']`** in root `turbo.json` (trivial). Insurance.
3. **`getEnv()` singleton + `resetEnvForTests()`** in `@ctxindex/core` (low/high). Single Zod schema for `CTXINDEX_*` envs. Tests get a deterministic reset hook.
4. **`env://VAR` URI scheme** in TOML loader (low/medium). Sits next to `keychain:` / `file:` references already in SPEC §7.
5. **`.env.example`** at repo root with structured comments (trivial). Documents every `CTXINDEX_*` plus optional `CTXINDEX_GMAIL_*` for the new loopback flow.
6. **`with-timeout.ts`** wall-clock guard (low/high). Mandatory for the e2e binary-spawn harness so a hung Google API never freezes CI.
7. **`createSandbox()` test helper** under `packages/core/src/testing/` (medium/high). Replaces the ad-hoc tmpdir setup scattered across `*.integration.test.ts` files. Returns `{ envOverrides, paths, db, cleanup }`.
8. **Binary-first e2e test pattern** under `apps/cli/src/e2e/` (medium/high). Spawns the actual `bun apps/cli/bin/ctxindex.mjs` with sandbox env and asserts on exit code, stdout, stderr, and SQLite row counts. This closes the V1.md §4 verifier-vs-CLI gap from the previous charter.

### Adopt later (next charter+)

9. **JUnit reporter + slowest finder** — Once the test suite hits 200+ tests.
10. **lint-staged + husky** — Reduces drift; not strictly needed when Biome runs in CI.
11. **`sync-env.ts`** — Only meaningful once ctxindex grows a second app.
12. **`worktree-new.sh`** — `.envrc` already handles the bulk of this.
13. **T3-style env package with `createEnv()`** — Overkill for single-binary; reconsider if a daemon/web companion lands.

### Explicitly skip

14. **`eslint-plugin-only-warn`** — ctxindex uses Biome; not applicable.
15. **SWC for package compilation** — Bun's TS pipeline supersedes; no `dist/` for internal packages.
16. **DockerManager / test containers** — Single-machine SQLite, no Postgres/Redis to isolate.

## Decision: loopback OAuth timing

The loopback flow (V1.md §1.4 — `redirect_uri=http://127.0.0.1:0`, short-lived listener, browser open) is missing from the current `apps/cli/src/commands/auth.ts` which still uses the deprecated `urn:ietf:wg:oauth:2.0:oob`. Decision: **fold loopback into the next charter as the first feature of milestone m1-sandbox-foundations**. The same charter bundles the binary-spawning e2e harness and `with-timeout.ts`, so the harness can run autonomously against a real Gmail account without manual code copy. This avoids shipping loopback twice (once standalone, once integrated with e2e).
