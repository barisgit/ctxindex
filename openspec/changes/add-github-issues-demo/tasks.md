## 1. Extension definitions and single-page sync

- [x] 1.1 Add failing tests for the public Provider, indexed Adapter, Profile, strict config/payload schemas, package entry, request headers, one-page sync, stable Refs, and pull-request/privacy filtering
- [x] 1.2 Implement the ordinary SDK definitions and normalized one-page GitHub Issues sync
- [x] 1.3 Run the focused Extension test and package/type gates

## 2. Complete pagination and failure safety

- [x] 2.1 Add failing mocked tests for more than 100 entries, exact next-Link validation, pagination loops, duplicate issues, bounds, 403/429 without retry, abort, malformed payload, and no partial emissions
- [x] 2.2 Implement bounded exact pagination and all-page buffering with a single final checkpoint
- [x] 2.3 Add failing and passing tests for single-page ETag/304 reuse and deliberate multi-page ETag non-reuse
- [x] 2.4 Run focused sync and architecture verification

## 3. Local CLI workflow and documentation

- [x] 3.1 Add an isolated mocked-network CLI e2e covering package load, Source creation, sync, local search with `--limit`/`--offset`, and get by returned Ref
- [x] 3.2 Add the complete Extension documentation sidecar, truthful public/fallback demo commands, and launch-website handoff constants without changing the website
- [x] 3.3 Refresh affected codemaps through the cartography workflow and run documentation/package discovery checks

## 4. Doctrine and final verification

- [x] 4.1 Promote applicable doctrine into `openspec/specs/github-issues-demo/implementation.md`
- [x] 4.2 Run compiled Extension e2e coverage, strict OpenSpec validation, and independent review
- [ ] 4.3 Run final project CI in a coordinated quiet window
