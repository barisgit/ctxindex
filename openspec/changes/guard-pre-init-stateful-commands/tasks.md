## 1. Guard fresh state before durable command dependencies

- [x] 1.1 Add a failing Client e2e reproduction for pre-init `client add --from-env`, including no credential output and no config/database/secret side effects.
- [x] 1.2 Implement the shared initialization preflight and invoke it centrally before database opening and before Client credential environment reads.
- [x] 1.3 Add a second failing/green regression for another database-backed command while preserving pre-init help and explicit init behavior.
- [x] 1.4 Run focused init, Client, and affected command e2e tests as the slice gate.

## 2. Doctrine and final verification

- [x] 2.1 Promote applicable doctrine into `openspec/specs/cli-surface/implementation.md` and refresh affected codemaps using the cartography skill.
- [x] 2.2 Run package typechecks, `bun run ci`, `bunx openspec validate --all --strict`, and `openspec-verify-change`.

## 3. Review fixes

- [x] 3.1 Require both persisted config and database evidence, with config-only partial-init regression coverage.
- [x] 3.2 Align Client flow documentation with provider-first validation.
- [x] 3.3 Assert the synthetic Keychain mock path before checking its absence.
- [x] 3.4 Standardize the exact `bun cli init` recovery guidance across runtime, focused tests, and change doctrine.
- [x] 3.5 Assert file-secret artifacts remain absent after config-only rejection.
- [x] 3.6 Specify and test provider validation before initialization.
