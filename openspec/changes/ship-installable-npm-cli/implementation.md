## Capability Implementation Targets

- `cli-distribution` → `openspec/specs/cli-distribution/implementation.md`

## Module Ownership

`apps/cli` owns the public `ctxindex` package manifest, executable entrypoint, and Bun-target bundle. The monorepo root remains a private orchestration package and owns contributor/release scripts. Internal workspace packages remain private source/build dependencies and retain their existing dependency direction; their code is incorporated into the CLI bundle rather than exposed as npm runtime edges.

The release verifier under `scripts/release/` owns archive construction checks, logical reproducibility, isolated installation, and installed CLI probes. `.github/workflows/release.yml` only composes repository commands and npm publication; it must not duplicate packaging policy in shell fragments.

## Interfaces and Data Flow

The published package contract is:

```json
{
  "name": "ctxindex",
  "license": "MIT",
  "bin": { "ctxindex": "dist/ctxindex.mjs" },
  "files": ["dist/ctxindex.mjs", "README.md", "LICENSE"],
  "dependencies": { "keytar": "7.9.0" }
}
```

The exact version is release-controlled. `dist/ctxindex.mjs` begins with `#!/usr/bin/env bun`, is built from `apps/cli/bin/ctxindex.mjs` for the Bun target, bundles internal workspaces and JavaScript dependencies, embeds canonical migration SQL and bundled skills through their existing import/macro seams, and preserves `import('keytar')` as the sole external runtime module.

Repository build flow is source entrypoint → Bun-target bundle → package allowlist inspection → `.tgz`. Verification addresses an archive by its exact path; isolated global installation and the publish step consume that same path rather than repacking. The package verifier exposes testable archive inventory/content-digest helpers and a CLI entrypoint for repository gates.

Contributor flow is dependency install → CLI package build → `bun link` within
`apps/cli` → global `ctxindex` bin symlink to the package's built entrypoint.
Existing `bun cli` remains the repository-isolated development path.

## Storage and State

Build output lives under ignored `apps/cli/dist/`; packed archives live in an ignored root release-artifact directory. Tests create temporary Bun install/cache roots plus isolated `CTXINDEX_*_HOME` directories and delete them after use. No production config, database, provider state, global Bun home, or npm credentials are accessed.

## Security and Compatibility

Archive inspection rejects path traversal, non-allowlisted members, sensitive filename classes, credential-like content, source maps, tests, specs, VCS/config files, and workspace imports in runtime output. The bundle preserves the existing full-trust external Extension boundary and no-network startup behavior.

The release workflow runs on a GitHub-hosted Ubuntu runner, pins third-party actions by commit, pins Bun 1.3.14, disables persisted checkout credentials and release caches, and grants `contents: read` globally. Only the protected npm publish job adds `id-token: write`; no `NODE_AUTH_TOKEN` or npm secret is referenced. npm CLI and Node versions meet npm's trusted-publishing minimums. Package repository metadata exactly identifies `barisgit/ctxindex`.

The push gate compares `apps/cli/package.json` at `github.event.before` and `github.sha`, validates a strict forward semantic-version change, and queries the exact `ctxindex@<version>`. A found exact version produces a successful idempotent skip even on rerun. An unchanged unpublished version, malformed/reversed version, and registry/network failures other than an exact npm `E404` fail closed. The protected publish job repeats the exact-version absence check after environment approval to close the validation-to-publish race. A protected `npm-production` GitHub environment supplies the Human approval boundary; after the package owner manually bootstraps the first exact artifact with 2FA, npm is configured for `barisgit/ctxindex`, workflow filename `release.yml`, matching environment, and publish permission. No token is committed.

## Verification

- Unit tests cover manifest policy, allowlisted archive members, sensitive path/content rejection, workspace runtime dependency rejection, normalized member digests, strict version-increase/idempotent-existing-version gating, and release workflow structure.
- The package integration gate builds and packs twice, compares normalized member/content digests, installs the first exact archive under a temporary Bun home, and runs help, skills, init/SQLite, and external TypeScript Extension probes from outside the checkout.
- Existing compiled Extension, catalog, skills, concurrent/native SQLite, and relocated provider workflow tests remain part of `bun run ci`.
- Final validation includes `bun run ci`, `bunx openspec validate --all --strict`, OpenSpec change verification, and cartography refresh.

## Promotion Notes

Create `openspec/specs/cli-distribution/implementation.md` with the package ownership, Bun bundle/keytar external boundary, exact-artifact data flow, temporary-state rules, release security constraints, and verification doctrine above before archive.
