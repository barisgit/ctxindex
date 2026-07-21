# ctxindex

ctxindex is a local personal-context gateway for agents. It provides one deterministic interface to discover, retrieve, and materialize context across mail, files, calendars, tasks, and extension-defined domains, then perform typed provider Actions through the same configured Source and authentication. Indexing is a strategy for fast local discovery, not the product boundary.

```text
Agent ───── CLI ────> ctxindex ──> Sources ──> providers/files
                         │
                         ├── Realms: personal / company / university
                         ├── Profiles: portable domain semantics
                         ├── Adapters: provider operations
                         └── Resources / Refs / Relations / Artifacts
```

## Agent integration

The CLI is the integration surface: any code-executing agent can use ctxindex
with zero integration work. Codex CLI, OpenClaw, Claude Code, and similar
agents compose `search`, `get`, `thread`, `export`, and `action` directly from
a shell, including from Hermes-driven OpenClaw sessions. There is no MCP
server and none is required; deterministic commands, low-token `--format text`,
compact `--format json` output, and stable exit codes are the contract. ctxindex was originally built to give a
personal OpenClaw agent governed, realm-scoped access to mail and calendar
across multiple accounts.

Search, get, thread, Artifact list, status, and Source, Realm, Account, OAuth
App, and Extension inventories accept `--format pretty|text|json`. With no
format flag, an interactive terminal gets width-aware pretty output and a pipe
gets escaped TSV or labeled complete text. TSV reserves `\N` for null and
escapes a literal backslash first. `--format` is the sole output selector and
`-f` is its short alias; `--format json` selects compact JSON. `get` includes the complete Resource
envelope and payload in every structured mode. Profile-defined
`export --format`, reference-oriented `describe --format`, sync streaming, and
daemon lifecycle output are separate format domains.

V1 and V1.1 are shipped. The project remains pre-alpha but functional: it provides multi-provider mail and calendar workflows through `search`, `sync`, `get`, `thread`, and `export`, plus reversible Draft actions. The implementation receives no schema or CLI compatibility treatment until a released version creates that obligation. Current behavior is owned by the capability specs under `openspec/specs/`; use `openspec list` for the authoritative active-change inventory.

## Development

Install once, then run workspace commands from the repository root. Turborepo
dispatches package-owned tasks and keeps their cache and dependency ordering
consistent.

```sh
bun install
bun dev                 # web development server
bun cli --help          # development CLI

bun build               # all workspace builds
bun build:web           # web only
bun build:cli           # CLI only
bun lint
bun typecheck
bun test
bun test:integration
bun test:e2e
bun ci                  # fast build/lint/typecheck/unit/verifier gate
```

Pull requests run `ci`, `test:integration`, and `test:e2e` as three required
jobs in parallel. Turbo fans each lane out to package-owned tasks and root
`//#...` verifier tasks, with local and GitHub Actions caches for repeat runs.
Test scripts set a workspace-local Keychain mock so automated lanes cannot
touch the user's native Keychain.

Use `bun clean` to remove workspace build output and caches while preserving
installed dependencies and `bun.lock`. Use `bun fullclean` when dependency
state itself must be rebuilt; run `bun install` afterward. `bun start` builds
and starts the production web app. Package scripts remain independently
runnable through Bun filters when a narrower command is needed.

To exercise the package executable through Bun's global bin directory:

```sh
cd apps/cli
bun run build:package
bun link
ctxindex --help
```

`bun link` registers the CLI workspace in Bun's global link directory and
exposes its `ctxindex` bin. The root `bun cli` path remains available and
isolates state in helper-created worktrees.

## Installation

ctxindex requires Bun 1.3.14. After the first public release:

```sh
bun add --global ctxindex
ctxindex --help
```

## Instant no-account demo

After `@ctxindex/demo-tenders` is published, install the official providerless Extension and Sync eight complete fictional tender Resources. It needs no OAuth, secrets, provider traffic, or prepared files:

```sh
ctxindex extension install npm \
  '@ctxindex/demo-tenders@0.1.0' \
  ctxindex.demo
ctxindex realm add demo --name 'Instant demo'
ctxindex source add ctxindex.demo.tenders --realm demo --label demo-tenders
ctxindex sync --source demo-tenders
ctxindex search 'solar schools' --realm demo
```

The install command is an explicit trust grant for package code and records an immutable exact version and integrity. Package publication plus anonymous install is a launch Human checkpoint; the [five-minute walkthrough](examples/tenders-extension/README.md) documents the current packed-artifact proof and continues through typed field filtering and complete Resource retrieval. All included tender records and organizations are synthetic.

## Packaging and release

The public package is a Bun-target bundle plus the native `keytar` runtime
dependency. Bundled workflow skills and canonical migrations are embedded;
trusted external Extensions remain explicit files loaded from configured paths.
`bun run pack:cli-package` creates one allowlisted tarball, and the isolated
smoke installs and runs that exact artifact outside the checkout.

Pushes to `main` are release candidates only when `apps/cli/package.json` has a
valid version strictly greater than the previous commit and that exact version
is absent from npm. Existing versions are successful no-ops. See
[`docs/release/npm.md`](docs/release/npm.md) for the protected trusted-publishing
setup and first-release checkpoint.

## Documentation map

| Document | Owns |
|---|---|
| `CONTRIBUTING.md` | Issue taxonomy and branch, OpenSpec, verification, and pull-request workflow |
| `BACKLOG.md` | Non-normative candidate roadmap and promotion into issues and OpenSpec changes |
| `CONTEXT.md` | Ubiquitous language and domain relationships |
| `SYSTEM.md` | Non-normative, agent-synthesized readable system projection |
| `openspec/specs/` | Canonical normative capability behavior and selective non-normative interface-first implementation doctrine |
| `docs/milestones/` | Completed V1 and V1.1 historical milestone records |
| `docs/design/2026-07-13-context-access-layer.md` | Decisions D1–D22 and cross-cutting rationale |

| `openspec/changes/` | Active and archived change proposals, artifacts, and tasks |
| `.agents/skills/repo-development/SKILL.md` | Triggered repository development and CLI walkthrough |
| `skills/` | Agent-facing usage docs shipped with the CLI |
