## 1. External identity and natural-key contract

- [x] 1.1 Add a focused failing static verification for typed RFC message identity, zero-to-many cross-Source natural-key resolution, distinct Resource identity, collapse deferral, and rejection of a separate external-reference store.
- [x] 1.2 Apply the `core-model` delta to remove the separate external-reference store and uniqueness-tuple requirements.
- [x] 1.3 Apply the `generic-storage` delta to remove the contradictory `external_refs` storage claim.
- [x] 1.4 Specify normalized RFC Message-ID exact-value semantics for `rfcMessageId` natural keys.
- [x] 1.5 Refresh affected `SYSTEM.md` identity, storage, Relation, and deferral prose from the canonical contract.
- [x] 1.6 Inspect current codemaps and update only wording directly contradicted by the clarified contract.
- [x] 1.7 Run the focused static verification and `git diff --check`.

## 2. Doctrine and final verification

- [x] 2.1 Confirm no implementation doctrine needs promotion and leave the absent `core-model` sidecar absent.
- [x] 2.2 Run strict OpenSpec validation, full CI when practical, and the OpenSpec verification workflow for `align-external-identity-contract`.
