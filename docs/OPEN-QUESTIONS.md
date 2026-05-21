# Open Questions

## f01-monorepo-bootstrap

- Ambiguity: The charter asks for root package name `ctxindex-root`, but `bun link` consumers normally link by package name while the verifier asks to run `bun link ctxindex`.
  Chosen answer: Keep the mandated root package name, expose the `ctxindex` binary from the root `bin` field, and let `scripts/verify/bun-link.sh` try `bun link ctxindex` before falling back to `bun link ctxindex-root` so the binary path is still validated from a temp project.
  Rationale: Bun derives the link package name from `package.json`, so `ctxindex` is the bin name rather than the link package name when the root package is `ctxindex-root`.
- Ambiguity: The explicit dev-dependency list omits `turbo`, but the feature requires a Turborepo `turbo.json` and root scripts that run Turbo tasks.
  Chosen answer: Install `turbo` as a root dev dependency along with the explicitly listed dev tools.
  Rationale: Without the Turbo CLI, `bun run build` and `bun run db:generate` cannot execute the required task graph.
- Ambiguity: The requirement says `turbo.json` pipelines, while current Turbo uses the `tasks` key in v2 config.
  Chosen answer: Use the current `tasks` schema with the requested task names.
  Rationale: This keeps the config valid for current Turbo while satisfying the requested build/lint/typecheck/test/db:generate graph.
- Ambiguity: The Biome requirement asks for 2-space indent, single quotes, and no semicolons-required while also saying to use default Biome style.
  Chosen answer: Configure `semicolons = "asNeeded"` and write generated code without semicolons.
  Rationale: This matches the "no semicolons-required" instruction and keeps formatter/linter output consistent.
- Ambiguity: The feature names `**/migrations/**` and `**/node_modules/**` as Biome excludes, but Biome 2.4 warns that folder ignores must not use a trailing `/**`.
  Chosen answer: Configure Biome `files.includes` as `!**/migrations` and `!**/node_modules`.
  Rationale: This is the current Biome 2 folder-ignore syntax and still excludes the requested folders from formatter and linter traversal.

## f02-paths-config-logger

- Ambiguity: The managed f02 plan says `ctxindex init` should run migrations and seed the `global` realm, but the feature handoff explicitly says DO NOT run migrations yet and to defer the seeded-realm assertion to f04.
  Chosen answer: `init` opens `ctxindex.sqlite` and applies the required SQLite PRAGMAs only; migrations and the `global` realm row remain for f04, with a TODO in `packages/core/src/cli-init.test.ts`.
  Rationale: The handoff is more specific for this implementation slice and aligns with the requested downstream f04 extension point.
- Ambiguity: V1/IMPLEMENTATION require gzip-on-rotate via `pino-roll`, but installed `pino-roll` v4 rotates files and does not natively gzip old files.
  Chosen answer: Keep `pino-roll` as the rotation sink and add a small logger-side post-rotation compression pass that gzips inactive `ctxindex.*.log` files when config `log.file.compress` is true.
  Rationale: This satisfies the gzip/retention/redaction requirement without replacing the mandated rotation library.

## f03-secrets-store

- Ambiguity: The f03 request describes `secrets.box` as a header with `entries: { [key]: base64-ciphertext }` while also saying the file is encrypted as a single envelope with one XChaCha20-Poly1305 nonce.
  Chosen answer: Store the encrypted record map as one authenticated XChaCha20-Poly1305 payload under `entries.box`, preserving the requested header fields (`v`, `nonce`, `salt`, `kdf`, `iters`, `entries`) without reusing a nonce across independently encrypted entries.
  Rationale: A single envelope matches the security intent and avoids nonce reuse; callers still interact through URL-safe `file:secrets.box#<key>` references and `listKeys()`.

## f05-adapter-registry

- Ambiguity: IMPLEMENTATION.md §3d.2.1 specifies `SyncFunction` as `AsyncIterable<SyncOperation>` but does not define `SyncOperation` or the item/chunk/raw-record payload types referenced elsewhere.
  Chosen answer: Define `SyncOperation` as a minimal placeholder `{ readonly type: string; readonly [key: string]: unknown }` for the registry contract only.
  Rationale: f05 must not implement schema, migrations, or sync payload logic yet; downstream sync features can replace the placeholder with the normalized operation union once those payload types exist.
- Ambiguity: Adapter sync stubs are required to throw `not_implemented_yet`, but SPEC §12 does not include `not_implemented_yet` in the `CtxindexSyncError` code set.
  Chosen answer: Include `not_implemented_yet` as a temporary placeholder `CtxindexSyncError` code in addition to the SPEC §12 codes.
  Rationale: The f05 request explicitly requires the stubs to throw `not_implemented_yet`, while downstream sync features can replace the placeholder before the sync runner maps terminal SPEC codes.
