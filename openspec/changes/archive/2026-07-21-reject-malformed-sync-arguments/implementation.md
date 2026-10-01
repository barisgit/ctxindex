## Capability Implementation Targets

- `sync-operations` → `openspec/specs/sync-operations/implementation.md`

## Module Ownership

The thin CLI argument layer owns sync argv grammar and returns the existing `SyncArgs` discriminated union. Core sync coordination, the CLI sync runner, storage, and Adapters remain downstream consumers of already validated input and do not duplicate argument validation.

## Interfaces and Data Flow

`runCli(args: string[]): Promise<number>` retains the original root argv and rejects option-like tokens placed before the selected `sync` command, before Citty can discard them during command selection. It preserves explicit help precedence and the existing global log-level extraction.

`parseSyncArgs(args: string[]): SyncArgs` remains the public subcommand parsing seam. It recognizes help before executable validation, applies the shared strict flag tokenizer to the documented sync flag set, rejects unexpected positional tokens and repeated presence-only flags, validates mode and format values, and returns either `{ kind: 'run', ... }`, `{ kind: 'help' }`, or `{ kind: 'unknown', message }`.

The sync command continues to parse argv before opening runtime dependencies or invoking the sync runner. Invalid input therefore terminates at the pure parser boundary and never reaches Source resolution or sync execution.

The thin command descriptor forwards mode as an unvalidated string so the pure parser remains the sole mode-value and invalid-usage exit boundary; framework enum validation must not preempt it.

## Storage and State

The parser owns no state and performs no I/O. Rejected input must not reach the storage-owning sync runner, so no Sync Run, Source sync-state transition, cursor write, or Resource materialization occurs.

## Security and Compatibility

Strict parsing rejects undeclared inputs rather than passing them toward provider or storage boundaries. Diagnostics identify flag names or argument categories without echoing unrelated values. Valid flag combinations and help precedence remain compatible; only malformed syntax loses permissive behavior.

## Verification

Parser tests cover valid modes/output flags plus unknown flags, unexpected positionals, duplicate scalar and boolean flags, boolean assignments, and missing scalar values. An isolated binary CLI test proves representative malformed invocations, including option-like tokens before `sync`, exit `2` without creating the database before initialization and without adding Sync Runs or changing existing Source sync state after initialization. It also preserves explicit help and valid global-option behavior. Strict OpenSpec validation, focused Biome, typecheck, and CLI thinness checks protect the surrounding contracts.

## Promotion Notes

Before archive, merge into `openspec/specs/sync-operations/implementation.md` the doctrine that the thin CLI sync parser owns a closed argv grammar, retains the `SyncArgs` union and help precedence, and rejects invalid input before runtime dependencies, Source resolution, sync execution, or storage effects.
