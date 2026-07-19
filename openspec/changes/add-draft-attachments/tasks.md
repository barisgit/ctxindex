## 1. Portable managed attachment contract

- [x] 1.1 Add failing Profile and generated-registry tests for strict standalone/reply create attachment inputs, rejected overrides/duplicates/empty arrays, update rejection, and ordered managed provenance.
- [ ] 1.2 Implement the minimal portable schemas, payload field, examples, and shared limits; pass focused Profile and registry tests.
- [x] 1.3 Slice gate: run all `@ctxindex/profiles` tests and affected extension-sdk registry/interface tests.

## 2. Source-scoped verified Artifact resolution

- [ ] 2.1 Add failing Artifact/core Action tests for current descriptor membership, same-Source scope, cached-byte integrity, metadata drift, missing/purged bytes, copied output, lazy auth, and zero provider I/O.
- [ ] 2.2 Extend the public Action context, Artifact store/service, and Action orchestration with the smallest read-only cached Artifact resolver; pass focused SDK/core tests and architecture checks.
- [ ] 2.3 Slice gate: run affected extension-sdk/core package tests and CLI malformed-input zero-side-effect tests.

## 3. Deterministic safe MIME

- [ ] 3.1 Add failing shared adapter tests for exact multipart MIME, CRLF normalization, binary base64 folding, Unicode filenames, deterministic collision-free boundaries, metadata controls, duplicates, and portable bounds.
- [ ] 3.2 Implement the shared adapter-internal attachment validator/renderer and pass its focused tests.
- [ ] 3.3 Slice gate: run the full adapter package test suite before provider integration.

## 4. Gmail attachment-bearing Draft creation

- [ ] 4.1 Add failing Gmail adapter, mock, and compiled CLI tests for standalone/reply attachment creation, exact MIME bytes, stable Draft Ref, thread identity, managed provenance, one mutation, malformed/unavailable zero-I/O, no retry, and no send route.
- [ ] 4.2 Implement Gmail standalone and reply Draft create with pre-resolved managed attachments and one existing Draft POST, preserving create behavior without attachments.
- [ ] 4.3 Slice gate: run focused Gmail adapter/mock tests, compiled Draft workflow, architecture checks, and no-send assertions.

## 5. Microsoft attachment-bearing Draft creation

- [ ] 5.1 Add failing Microsoft adapter, Graph mock, and compiled CLI tests for standalone/reply MIME creation, exact attachment bytes, immutable Draft Ref, conversation identity, managed provenance, one mutation, malformed/unavailable zero-I/O, and no send route.
- [ ] 5.2 Implement Microsoft standalone and native reply Draft create with one attachment-bearing MIME POST, preserving create behavior without attachments.
- [ ] 5.3 Slice gate: run focused Microsoft adapter/mock tests, compiled multi-provider workflow, auth-scope checks, architecture checks, and no-send assertions.

## 6. Human design checkpoint: preservation-only updates

- [ ] 6.1 Present provider evidence and obtain explicit approval that update cannot add/remove/clear/replace attachments, Microsoft preserves by PATCH omission, and Gmail replays only a locally proven managed set or fails before mutation.
- [ ] 6.2 After approval, add failing Gmail/Microsoft/core tests for known-empty provenance, exact Gmail byte replay, unavailable/unknown safe failure, Microsoft omission preservation, reply-context immutability, one mutation, and zero provider reads/retries.
- [ ] 6.3 After approval, implement the minimal Draft provenance and provider update preservation paths without attachment collection mutations.
- [ ] 6.4 Slice gate: run both provider Draft suites, mocked compiled workflows, malformed-input/no-send checks, and affected core tests.

## 7. Doctrine and final verification

- [ ] 7.1 Refresh affected generated documentation and codemaps/System projection where required without duplicating normative truth.
- [ ] 7.2 Promote applicable doctrine into every canonical capability implementation sidecar named by `implementation.md`.
- [ ] 7.3 Run `bun run ci`, `bunx openspec validate --all --strict`, `openspec-verify-change add-draft-attachments`, and `git diff --check`; resolve every critical or warning-level divergence.
- [ ] 7.4 Perform an independent final review for correctness, regressions, security, contract drift, and missing verification.
- [ ] 7.5 Human live Draft checkpoint: prepare isolated state and exact harmless Gmail/Microsoft Draft create/update actions, pause for consent, then record only redacted visible Draft/no-send evidence after approval.
