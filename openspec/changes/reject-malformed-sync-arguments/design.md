## Context

The sync command accepts a small documented option set, but its current parsing is permissive: malformed tokens can be ignored or collapsed into a usable request. This is unsafe because reaching sync execution may create run history, change Source sync state, access providers, or update local materialization. The CLI is a stable agent integration surface, so invalid syntax needs deterministic rejection.

## Goals / Non-Goals

**Goals:**

- Make the documented sync grammar closed and deterministic.
- Reject all specified malformed forms before sync execution or persistence.
- Preserve every currently valid sync invocation and help behavior.

**Non-Goals:**

- Changing sync modes, output formats, execution, persistence, or provider behavior.
- Introducing compatibility aliases or deprecation handling for malformed syntax.
- Generalizing strict parsing across unrelated commands.

## Decisions

1. Treat every documented sync flag as single-occurrence. This avoids ambiguous precedence and matches the command's scalar and toggle semantics. Choosing first-wins or last-wins was rejected because either silently hides caller mistakes.
2. Treat boolean flags as presence-only. Assignment forms such as `--json=false` are rejected rather than coerced because the documented grammar exposes no boolean values.
3. Preserve help precedence. An explicit help request continues to return help without requiring the rest of the token stream to form an executable sync request.
4. Reject malformed input before execution begins. Invalid syntax is usage failure, not a failed Sync Run, so it must leave run history and Source sync state unchanged.

## Risks / Trade-offs

- Previously tolerated malformed automation will begin failing with exit `2` → This is intentional contract tightening, and diagnostics identify the offending argument.
- Strict token handling may expose inconsistent expectations across other commands → Scope remains limited to sync; broader parser alignment requires separate evidence and work.

## Migration Plan

Not applicable. No persistent data or deployed state changes.

## Open Questions

None.
