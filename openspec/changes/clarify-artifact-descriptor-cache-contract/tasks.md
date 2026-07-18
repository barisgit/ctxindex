## 1. Artifact descriptor and cache contract

- [x] 1.1 Add a focused failing static verification for descriptor identity, lazy CAS download, purge preservation, export separation, and raw-payload separation.
- [x] 1.2 Apply the `core-model` delta so the canonical Artifact definition matches the established retrieval-and-artifacts lifecycle.
- [x] 1.3 Align `CONTEXT.md` terminology and relationships with the canonical descriptor/cache distinction.
- [x] 1.4 Refresh affected `SYSTEM.md` sections and source projection without changing runtime claims.
- [x] 1.5 Align generic-storage implementation doctrine with on-demand descriptor derivation and download-only cache metadata writes.
- [x] 1.6 Run the focused static verification and `git diff --check`.

## 2. Doctrine and final verification

- [x] 2.1 Confirm that no implementation doctrine needs promotion and leave the absent `core-model` sidecar absent.
- [x] 2.2 Run strict OpenSpec validation, full CI when practical, and the OpenSpec verification workflow for `clarify-artifact-descriptor-cache-contract`.
