# Final four-way drift sweep

Date: 2026-07-16
Scope: OpenSpec task 11.2.

## Result

Passed after three low-severity documentation corrections. No production contract or schema drift was found.

The sweep compared:

1. live registries, schemas, package manifests, Adapter/Profile/Action definitions, environment allowlists, and production module ownership;
2. `CONTEXT.md`, `SPEC.md`, `V1.md`, `V1_1.md`, `IMPLEMENTATION.md`, and accepted design D1–D22;
3. active delta specs and current main capability specs;
4. generated describe/help/skills surfaces, codemaps, and `.slim/cartography.json`.

## Demonstrated drift corrected

- `skills/README.md` still described bundled workflows as V1 even though they now cover V1.1 Microsoft, Calendar, multi-Account, and Draft behavior. It now points to `V1_1.md`.
- `packages/core/src/auth/codemap.md` named only the Google provider declaration. It now names both built-in Google and Microsoft declaration owners.
- The completed Microsoft checkpoint evidence heading still said “partial”; it now matches its complete state.

No speculative cleanup was applied.

## Areas verified coherent

- Domain language, explicit Realm ownership, Account/Grant/Source relationships, stable Refs, and no global Realm.
- Provider-neutral OAuth and exact selected Adapter scope requests.
- Read-only Google and Microsoft Calendar definitions with zero mutation Actions/routes.
- Gmail and Outlook reversible Draft create/update with no send capability or `Mail.Send`.
- Built-in Profile/Adapter/Action inventories, root CLI commands, generated help and registry metadata.
- Central env schema and `.env.example`, workspace dependencies, Bun 1.3.14 pin, and approved provider hosts.
- Main OpenSpec requirements modified by this change have matching delta targets. Newly added capabilities are intentionally pending the mandatory task 11.5 main-spec synchronization while the change remains active.

Archived prototype/release material was excluded as directed by repository ownership rules.

## Microsoft cumulative permission assessment

The live reused Microsoft client returned a pre-consented cumulative `Calendars.ReadWrite` scope in addition to the narrower requested set. This is not an implemented Calendar-write capability and does not contradict product behavior:

- `microsoft.calendar@1` requests only `Calendars.Read`;
- its definition exposes only sync/retrieve and no Action;
- production Calendar modules contain no mutation route;
- architecture gates reject Calendar write scopes and mutation verbs;
- checkpoint evidence explicitly distinguishes provider-returned Grant scopes from ctxindex-requested scopes.

No write handling or broader request was added.

## Cartography and focused checks

- Incremental cartography detected the single changed production file, refreshed state for 249 tracked files, and then reported `No changes detected`.
- Bundled skills/guidance tests passed.
- Registry-interface/help metadata tests passed.
- Strict change/all OpenSpec validation and `git diff --check` passed.
