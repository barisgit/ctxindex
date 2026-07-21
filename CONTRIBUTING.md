# Contributing to ctxindex

ctxindex is pre-alpha. Product behavior is owned by the repository's
specifications: an issue records the problem and evidence, while OpenSpec owns
normative changes and implementation tasks. External contributions use focused
pull requests. Maintainers may land genuinely trivial documentation or
non-contract fixes directly when a branch and PR would add no review value.

## Issue taxonomy

Use a type and one primary area. Add an exceptional marker only when it changes
how the issue should be handled:

| Category | Labels | Meaning |
|---|---|---|
| Type | `bug`, `enhancement` | Broken accepted behavior versus new capability or ergonomics |
| Area | `area:search`, `area:mailbox`, `area:actions`, `area:storage`, `area:sync`, `area:calendar`, `area:cli` | Primary implementation surface |
| Exceptional | `priority:P0`, `good first issue` | Core-workflow blocker or bounded newcomer task |

Keep labels sparse: choose the primary area rather than tagging every affected
package. GitHub state, linked branches, and pull requests represent lifecycle;
do not add parallel `in-progress` labels.

## Change workflow

1. Start from a GitHub issue with runtime evidence, an expected outcome,
   acceptance criteria, and explicit non-goals.
2. Create its isolated worktree with
   `./scripts/worktree-new.sh <type>/<short-slug>`. Branches use one of
   `feature`, `fix`, `docs`, or
   `chore` (for example `feature/browse-and-paginate-search`). The worktree
   lives under `.worktrees/` and `bun cli` automatically uses isolated state.
3. For a non-trivial behavior change, create the OpenSpec change on that branch
   before implementation. The issue owns the user-visible problem; the
   OpenSpec proposal, delta specs, design, and tasks own the solution contract.
4. Implement the smallest independently verifiable task slice and pass every
   task gate before continuing.
5. Run the focused checks plus the repository gates documented in the
   [`repo-development` skill](.agents/skills/repo-development/SKILL.md).
6. Open one pull request that links and closes the issue. Pull requests into
   `main` run the repository, integration, and E2E gates. Include the observed
   behavior change, verification evidence, remaining risk, and any human
   checkpoint still required.
7. Run `openspec-verify-change` after implementation. Archive a completed
   OpenSpec change only when explicitly requested.

Trivial fixes do not need OpenSpec. If a supposedly trivial change alters a
stable contract, exit behavior, provider semantics, or multiple subsystems,
stop and create an OpenSpec change.

## CLI package verification

Build and expose the package executable locally from the CLI workspace:

```sh
cd apps/cli
bun run build:package
bun link
ctxindex --help
```

`bun link` registers the CLI workspace in Bun's global link directory and
exposes its package bin. Release verification instead packs one staging
manifest and installs that exact tarball with temporary
`BUN_INSTALL_GLOBAL_DIR`, `BUN_INSTALL_BIN`, `BUN_INSTALL_CACHE_DIR`, and
`CTXINDEX_*_HOME` paths. Run the focused package checks from the repository root:

```sh
bun test tests/tooling/verify/cli-package.test.ts tests/tooling/release/cli-package.test.ts
bun run pack:cli-package
bun run smoke:cli-package -- dist/npm/artifacts/ctxindex-<version>.tgz
```

The smoke may download `keytar`; it never uses the user's global Bun or ctxindex
state. Release ownership and trusted-publisher setup are documented in
[`docs/release/npm.md`](docs/release/npm.md).

## Live-provider evidence

Use isolated ctxindex state for automated tests and loopback provider mocks.
Live checks may use configured global authentication only at an explicit human
checkpoint. Never commit credentials, tokens, private message or event bodies,
or unredacted provider payloads. Store redacted operator evidence under
`.operator-artifacts/`; it is intentionally outside Git.

## Sources of truth

Do not duplicate product behavior in issues or contributor prose:

| Question | Owner |
| --- | --- |
| Domain terms and relationships | [`CONTEXT.md`](CONTEXT.md) |
| Normative behavior | [`openspec/specs/`](openspec/specs/) |
| Selective implementation doctrine | Adjacent `implementation.md` sidecars |
| Current readable system tour | [`SYSTEM.md`](SYSTEM.md) |
| Accepted cross-cutting decisions D1-D22 | [`docs/design/2026-07-13-context-access-layer.md`](docs/design/2026-07-13-context-access-layer.md) |
| Completed release scope | [`docs/milestones/`](docs/milestones/) |
| Future possibilities | [`BACKLOG.md`](BACKLOG.md) |
| Agent-driving development workflow | [`.agents/skills/repo-development/SKILL.md`](.agents/skills/repo-development/SKILL.md) |
