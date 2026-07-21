## 1. Strict sync argument parsing

- [x] 1.1 Add failing parser coverage for unknown flags, unexpected positionals, duplicate scalar and boolean flags, boolean assignments, and missing scalar values while preserving valid and help behavior.
- [x] 1.2 Implement the closed sync grammar in the pure CLI parser and pass the focused parser test.

## 2. Side-effect boundary

- [x] 2.1 Add failing isolated binary CLI coverage proving malformed arguments exit `2` before database creation and leave existing Sync Run and Source sync state unchanged.
- [x] 2.2 Pass the isolated malformed-sync CLI test without changing the sync runner, core sync execution, or storage.

## 3. Doctrine and final verification

- [x] 3.1 Promote the thin CLI validation boundary into the canonical sync-operations implementation sidecar.
- [x] 3.2 Run the focused parser and isolated CLI tests, strict OpenSpec validation, typecheck, CLI thinness, focused Biome, and diff integrity checks; leave full repository CI and change verification to the coordinating root run.

## 4. Binary mode validation

- [x] 4.1 Prove bare and invalid mode values reach the pure sync parser, exit `2`, and leave configured sync state unchanged; change only the sync command descriptor needed to remove Citty enum pre-validation.
- [x] 4.2 Re-run focused parser and binary tests, typecheck, strict OpenSpec validation, focused Biome, and diff checks.
- [x] 4.3 Reject option-like tokens before the selected `sync` command before Citty discards them, with isolated binary coverage for unknown, boolean-assignment, and invalid-mode prefix forms plus preserved help/global-option behavior.
