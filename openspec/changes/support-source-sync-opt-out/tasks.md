## 1. Core Source creation policy

- [x] 1.1 Add failing public Source service tests for default, explicitly disabled, and explicitly enabled sync persistence, then add optional `AddSourceInput.syncEnabled` and explicitly persist the effective value.
- [x] 1.2 Run the focused core Source service tests and typecheck the affected core package.

## 2. Strict Source CLI flag and delegation

- [x] 2.1 Add failing parser and isolated CLI tests for one bare `--no-sync`, assignment/repetition/malformed rejection before state, generated Citty declaration, and boolean forwarding; implement the smallest parser, declaration, and delegation changes.
- [x] 2.2 Run focused Source argument, command, isolated CLI, and no-prompt tests.

## 3. Inventory and sync enforcement

- [x] 3.1 Add failing formatter/e2e assertions for `source list --json` reporting `syncEnabled`, then expose the stored value.
- [x] 3.2 Verify all-Source sync skips disabled Sources and targeted disabled-Source sync performs zero provider calls, strengthening focused tests where necessary.
- [x] 3.3 Run focused Source formatter/e2e and sync command tests.

## 4. Doctrine and final verification

- [x] 4.1 Promote applicable doctrine into canonical realm-and-source-management and sync-operations implementation sidecars.
- [x] 4.2 Run strict OpenSpec validation, relevant typecheck and Biome checks, and Git diff checks; leave the complete repository CI and OpenSpec implementation verification to the root integration agent.
