## 1. Adapter and Profile ownership

- [x] 1.1 Add a failing architecture contract for built-in Adapter locality and composition-only builtins, then move Gmail and Local Directory definitions, configuration, operations, helpers, integration tests, and focused tests under their owned Modules.
- [x] 1.2 Delete the unreachable Google OAuth/provider client surface and compatibility export, move the communication Profile registry contract to `packages/profiles`, and make Local Directory reuse the Profile-owned normalized path invariant.
- [x] 1.3 Remove unused Adapter dependencies and pass Adapter/Profile focused tests, typecheck, lint, network-egress verification, and diff checking before the next slice.

## 2. Public Extension SDK depth

- [x] 2.1 Lock the exact public SDK value/type surface and factory inference, then split references, Profile contracts, provider operation contexts, Adapter contracts, and Extension factories behind the unchanged package index.
- [x] 2.2 Pass SDK/package tests, root typecheck/lint, external Extension boundary tests, and the relocated D3 compiled-Extension spike before the next slice.

## 3. Thin CLI and presentation Modules

- [x] 3.1 Split registry projection, JSON-Schema detail rendering, text rendering, and Markdown rendering behind the existing formatter Interface while preserving progressive describe/help output and JSON cardinality.
- [x] 3.2 Move Action and Artifact workflows out of Citty command declarations, replace behavior-equivalent bespoke flag loops with shared parsing, and remove the unused duplicate SecretsStore dependency field.
- [x] 3.3 Make thin-command verification discover every production command automatically, add its failing omission/oversize contracts first, and pass focused CLI tests, registry/source/action/artifact e2e tests, typecheck, lint, and diff checking before the next slice.

## 4. Core prototype and locality cleanup

- [x] 4.1 Add a focused Source-removal contract over every generic Source-owned table, then delete the unused prototype sync-operation union and the dynamic Adapter-table sweep forbidden by `SPEC.md` §§3b and 8.
- [x] 4.2 Extract logger redaction and rotation/compression implementation behind private Modules while preserving the current logger Interface, timing, file behavior, and redaction tests.
- [x] 4.3 Consolidate Secrets exports into its capability index, point core package subpaths directly at capability indexes, remove redundant root shims, and relocate the orphan agent-howto meta-test to repository verification.
- [x] 4.4 Pass core focused tests, canonical migration/schema drift checks, typecheck, lint, full unit tests, and diff checking before the next slice.

## 5. Durable dependency and documentation health

- [x] 5.1 Add repository verification that discovers workspace imports, rejects unused direct runtime dependencies, and enforces the established package dependency direction without hardcoded source-file allowlists.
- [x] 5.2 Prune unused manifests, regenerate the Bun lockfile, document Module ownership/locality in `IMPLEMENTATION.md`, and correct stale codemaps and storage comments that imply Adapter-owned tables.
- [x] 5.3 Pass package-boundary, architecture, install/build, compiled CLI, D3, typecheck, lint, full unit/integration/e2e, strict OpenSpec, and diff gates before final review.

## 6. Final architecture verification

- [x] 6.1 Run drift-sweep and incremental cartography over the settled tree; update only demonstrated stale documentation and affected codemaps.
- [x] 6.2 Independently review Module depth, ownership, public-seam stability, dependency direction, test locality, and absence of cosmetic fragmentation; resolve every important finding.
- [ ] 6.3 Run the final complete CI/QA gate on the reviewed snapshot, verify the OpenSpec change semantically, curate charter evidence, and leave the change active for explicit archive.
