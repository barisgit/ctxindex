# Contributing to ctxindex

ctxindex is pre-alpha. Work is organized around focused GitHub issues, one
issue-linked branch, and one pull request. Product behavior remains owned by
the repository's specification documents; an issue records the problem and
evidence, while OpenSpec owns normative changes and implementation tasks.

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
2. Create a short issue-linked branch named `<type>/<short-slug>`, where
   `<type>` is `feature`, `fix`, `docs`, or `chore` (for example
   `feature/browse-and-paginate-search`). Codex-created branches instead use
   `codex/<issue-number>-<short-slug>`.
3. For a non-trivial behavior change, create the OpenSpec change on that branch
   before implementation. The issue owns the user-visible problem; the
   OpenSpec proposal, delta specs, design, and tasks own the solution contract.
4. Implement the smallest independently verifiable task slice and pass every
   task gate before continuing.
5. Run the focused checks plus the repository gates documented in the
   [`repo-development` skill](.agents/skills/repo-development/SKILL.md).
6. Open one pull request that links and closes the issue. Include the observed
   behavior change, verification evidence, remaining risk, and any human
   checkpoint still required.
7. Run `openspec-verify-change` after implementation. Archive a completed
   OpenSpec change only when explicitly requested.

Trivial fixes do not need OpenSpec. If a supposedly trivial change alters a
stable contract, exit behavior, provider semantics, or multiple subsystems,
stop and create an OpenSpec change.

## Live-provider evidence

Use isolated ctxindex state for automated tests and loopback provider mocks.
Live checks may use configured global authentication only at an explicit human
checkpoint. Never commit credentials, tokens, private message or event bodies,
or unredacted provider payloads. Store redacted operator evidence under
`.operator-artifacts/`; it is intentionally outside Git.

## Sources of truth

Do not duplicate product behavior in issues or contributor documentation. Use
the documentation ownership map in [`README.md`](README.md) to locate the
authoritative domain vocabulary, specification, release scope, design
decisions, implementation choices, and agent-driving recipes.
