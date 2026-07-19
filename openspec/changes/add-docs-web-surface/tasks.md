## 1. Web contract and routing

- [x] 1.1 Add failing focused coverage for configurable canonical metadata, repository source paths, and exact Markdown/image route suffixes including malformed not-found cases
- [x] 1.2 Implement canonical-origin metadata, corrected source links, and exact representation route validation
- [x] 1.3 Run the focused web tests, typecheck, and production build

## 2. Dependency verification

- [x] 2.1 Add a failing verifier fixture proving an ordinary undeclared import in `web` is reported while generated directories, local aliases, and recognized framework imports are accepted
- [x] 2.2 Remove the web exemption and implement the narrow generated-directory, alias, framework, peer, and manifest handling needed by the workspace verifier
- [x] 2.3 Run the focused dependency-verifier tests and repository dependency check

## 3. CLI and workflow documentation accuracy

- [x] 3.1 Audit every CLI reference page against current command help and correct adjacent command, flag, identifier, and output-envelope drift
- [x] 3.2 Correct landing and terminal examples to executable current CLI commands with valid Ref/ULID placeholders and current JSON envelopes
- [x] 3.3 Document the merged local Git Catalog, both trust gates, refresh behavior, install/uninstall flows, and absence of a hosted marketplace
- [x] 3.4 Correct threaded reply and immutable Draft update guides and describe compact/full JSON semantics against current Action and describe contracts
- [x] 3.5 Run focused documentation/content checks and CLI help smoke verification

## 4. Deployment and branch hygiene

- [x] 4.1 Correct web deployment documentation to distinguish prerendered pages from server/serverless search runtime
- [x] 4.2 Retain final and iterative `.screenshots` assets in the branch so the pull request is self-contained for remote visual review
- [x] 4.3 Run web formatting/lint, typecheck, and production build after content and deployment edits

## 5. Documentation structure

- [x] 5.1 Refresh affected codemaps for the new web workspace and verifier structure
- [x] 5.2 Refresh `SYSTEM.md` only if canonical capability changes require a non-normative projection update; otherwise record that no system refresh is warranted

## 6. Doctrine and final verification

- [x] 6.1 Promote applicable doctrine into `openspec/specs/docs-web-surface/implementation.md`
- [x] 6.2 Run `bun run ci` and `bunx openspec validate --all --strict`
- [x] 6.3 Run `openspec-verify-change` for `add-docs-web-surface` and resolve all critical, warning, and suggestion findings
- [x] 6.4 Prepare the deployed visual-review checkpoint and report that human visual approval remains required without committing review captures
