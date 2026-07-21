## 1. OpenSpec and privacy boundary

- [x] 1.1 Validate proposal, design, delta spec, implementation doctrine, and task scope strictly before test implementation.
- [x] 1.2 Establish a failing shared replay test that imports only obviously invented `.test` fixtures and performs no live or captured-provider access.

## 2. Shared compiled retrieval replay

- [x] 2.1 Add additive test-local fixtures, compiled CLI process runner, and narrow Google/Microsoft drivers without changing shared provider mocks or production files.
- [x] 2.2 Prove remote-search stable Ref, complete ad-hoc body/conversation/reply/Artifact hydration, and byte-identical fresh-process cached retrieval with no provider read.
- [x] 2.3 Slice gate: run the focused shared replay retrieval phase for both provider drivers.

## 3. Artifact lifecycle and offline exports

- [x] 3.1 Prove exact first download, CAS-backed second output copy without provider I/O, explicit purge preserving the Resource/descriptor, and one exact provider re-fetch.
- [x] 3.2 Prove deterministic offline EML and JSON exports from the hydrated Resource through fresh compiled CLI processes.
- [x] 3.3 Slice gate: run the focused shared replay Artifact/export phases for both provider drivers.

## 4. Invalid identities and privacy review

- [x] 4.1 Prove malformed or foreign message and Artifact Refs fail through existing exits before provider I/O for both drivers.
- [x] 4.2 Self-review every added fixture, assertion, and OpenSpec claim for invented `.test` identities, bounded credential-free route inspection, issue #4 non-substitution, and absence of production behavior changes.
- [x] 4.3 Slice gate: run the complete focused replay for both providers plus formatting, typecheck, and diff checks for changed files.
- [x] 4.4 Isolate compiled child environments from ambient credentials/configuration by construction and prove representative dangerous keys are absent without printing values.

## 5. Doctrine and final verification

- [x] 5.1 Confirm no canonical implementation doctrine promotion or cartography/system-reference refresh is applicable because no durable structure or production behavior changed.
- [x] 5.2 Run `bun run ci`, `bunx openspec validate --all --strict`, and `openspec-verify-change` for `mailbox-retrieval-artifact-replay`; resolve every critical or warning finding.
