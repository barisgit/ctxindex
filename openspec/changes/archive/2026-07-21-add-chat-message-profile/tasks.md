## 1. Chat message Profile slice

- [x] 1.1 Add focused failing schema tests for required identities, structured sender data, content presence, timestamp ordering, attachment descriptors, strict unknown-property rejection, and absence of mail/provider fields.
- [x] 1.2 Implement the strict `chat.message@1` schema, inferred public type, deterministic compound-natural-key helper, and Profile definition.
- [x] 1.3 Add and pass focused search, typed-field, Artifact, conversation Relation, and both parent Relation tests, including provider/core independence and the absence of Actions or exports.
- [x] 1.4 Export the Profile through the package root and `./chat-message` subpath, then pass the `@ctxindex/profiles` typecheck and lint gates.

## 2. Doctrine and final verification

- [x] 2.1 Update the canonical `profile-vocabulary` specification and promote applicable public-interface and ownership doctrine into its implementation sidecar.
- [x] 2.2 Refresh the affected profile-package codemaps without absorbing unrelated pre-existing cartography drift.
- [x] 2.3 Run focused tests, package typecheck/lint, repository CI, integration and end-to-end gates, and strict OpenSpec validation; record any unrelated environmental failure.
