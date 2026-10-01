## Context

The canonical schema already stores `sources.sync_enabled` as a non-null boolean defaulting to true, and sync orchestration already consults it. The missing path is Source creation: neither the core input nor the CLI can choose false, and Source JSON inventory omits the value. The CLI uses a custom parser behind generated Citty command declarations, so both layers must recognize the same bare flag while validation must happen before opening persistent dependencies.

## Goals / Non-Goals

**Goals:**

- Make sync opt-out an explicit creation-time Source policy.
- Keep default creation behavior unchanged.
- Make invalid flag forms fail as usage without touching persistent state.
- Report the effective policy in JSON inventory.

**Non-Goals:**

- Toggling existing Sources.
- Changing search, retrieval, Actions, Account/Grant selection, Adapter config, or routing behavior.
- Adding migrations, compatibility aliases, or provider-specific handling.

## Decisions

1. `--no-sync` is a generic bare boolean Source-add flag. A positive flag is unnecessary because omission already preserves the true default. Assignment, repetition, and non-exact spellings are rejected to keep the CLI contract deterministic.
2. Core accepts an optional `syncEnabled` boolean and writes `input.syncEnabled ?? true` explicitly. Relying on the database default would obscure the caller-selected false value and make service behavior depend on omitted insert columns.
3. JSON inventory reports the stored value as `syncEnabled`; text and compact inventory remain unchanged because the requested machine-readable contract is sufficient and avoids widening the human table.
4. Existing sync orchestration remains the enforcement point. Tests pin all-Source exclusion and targeted failure before provider invocation rather than adding duplicate guards.

## Risks / Trade-offs

- [Citty and the custom parser could disagree about the flag] -> Declare `no-sync` in generated command arguments and test both parser semantics and CLI help/invocation.
- [A false value could be lost through truthiness-based forwarding] -> Forward an explicit boolean derived from flag presence and assert persistence through the public Source service.
- [Invalid forms could reach dependency opening] -> Keep all shape validation in `parseSourceArgs` and exercise an isolated CLI seam that records whether dependencies open.

## Migration Plan

No migration is required. Existing rows remain unchanged, and new rows continue to default effectively to true unless the caller explicitly opts out.

## Open Questions

None.
