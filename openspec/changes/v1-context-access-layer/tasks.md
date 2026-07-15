# Execution and verification contract

The apply agent MUST work in dependency order and continue through all tasks until completion or a real blocker. It MUST NOT stop merely because one task or slice passed.

For every behavior task:

1. state the observable success condition and focused verification command;
2. add or identify a failing test before implementation when behavior changes;
3. make the smallest implementation for that task;
4. run the focused test plus any checks named in the task;
5. check the task only after all required verification passes.

Every **Slice gate** is a mandatory mid-change checkpoint. On failure, fix the current slice and rerun the gate; do not continue with a known failure. Record commands and outcomes in the session summary/commit.

Every **Human checkpoint** is an intentional pause, not a blocker. The agent prepares the isolated test state and exact next action, explains what access or provider mutation will occur, and pauses before login/consent. The user completes browser login/MFA or grants approval without sharing credentials. After explicit confirmation, the agent resumes, runs the bounded live acceptance check, records evidence without secrets, and continues. Human checkpoints MUST NOT be skipped or simulated. Otherwise pause only for an unresolved design decision, external blocker, or artifact contradiction — never guess.

After the final task, run the `openspec-verify-change` workflow against all requirements/scenarios. The change is end-to-end complete only when all task boxes are checked, every slice/final gate passes, and verification reports no critical mismatch. Archive remains a separate explicit action.

## 1. Definition factories and typed registries

- [x] 1.1 Create `packages/extension-sdk` with type-only public contracts and pure `defineProfile`, `defineAdapter`, and `defineExtension` factories; verify inferred ids/payloads and zero runtime-core imports.
- [x] 1.2 Implement the Profile registry with runtime schema validation, `(id, version)` duplicate detection, unknown-version degradation, and focused unit tests.
- [x] 1.3 Implement Adapter and Extension registries with capability/Action consistency checks and atomic Extension rejection tests.
- [x] 1.4 Implement registry-derived `describe` data for kinds, aliases, fields, formats, Source config, and Actions; verify a fake Profile changes the described interface without hand-maintained vocabulary.
- [x] 1.5 **Slice gate:** run all definition/registry tests plus `bun run typecheck`, `bun run lint`, and `bun test`; fix every failure before checking this gate.

## 2. Explicit-path Extension loading

- [x] 2.1 Add configuration for trusted explicit local Extension paths and dynamically import one external `.ts` fixture into the validated registries.
- [x] 2.2 Inject only capability-specific host contexts, load built-ins first, and report atomic validation/id-conflict diagnostics; verify invalid Extensions activate nothing.
- [x] 2.3 Integrate `scripts/spikes/d3-compiled-extension/run.sh` into CI and verify the relocated Bun 1.3.14 binary loads the external fixture and its own dependency.
- [x] 2.4 Preserve materialized Resources and mark Sources unavailable when a configured Extension disappears; verify no implicit data deletion.
- [x] 2.5 **Slice gate:** run Extension loader/invalidation tests, `./scripts/spikes/d3-compiled-extension/run.sh`, `bun run typecheck`, `bun run lint`, and `bun test`; fix every failure before proceeding.

## 3. Generic Resource storage

- [x] 3.1 Replace prototype schema definitions with the fresh core-owned Realm, Account, Grant, Source, Resource, field-index, chunk/FTS, Relation, Artifact, and Sync bookkeeping schema; initialize only fresh databases.
- [x] 3.2 Implement transactional Resource upsert and Profile-derived field/chunk projection with one fake Profile; verify rollback leaves no partial projections.
- [x] 3.3 Implement stable Source-scoped `ctx://` identity and `adhoc`/`synced` origin transitions; verify later Sync converges on the same Resource.
- [x] 3.4 Implement synced tombstones and ad-hoc eviction semantics; verify deleted synced Resources remain addressable but excluded by default.
- [x] 3.5 Implement Ref/natural-key Relation writes, lazy resolution, dangling-edge observability, and inverse traversal tests.
- [x] 3.6 Implement cursor/run/lock transactions so successful Sync commits Resource writes and cursor together while failure advances neither.
- [x] 3.7 Implement explicit Realm creation and exact Source/Realm/Grant binding; verify no `global` Realm is seeded and invalid or ambiguous bindings fail.
- [x] 3.8 **Slice gate:** recreate a database from empty, run generic-storage integration tests, assert no prototype/domain tables exist, then run `bun run typecheck`, `bun run lint`, and `bun test`; fix every failure before proceeding.

## 4. Minimal Gmail search and get

- [x] 4.1 Define the minimal `communication.message` Profile payload, typed fields, search chunks, and docs required for Gmail search/get.
- [x] 4.2 Rewrite Gmail auth and Source setup against declarative auth plus explicit Realm/Grant binding; verify mocked authorized HTTP uses only the linked Grant.
- [x] 4.3 Implement Gmail `searchRemote` returning stable envelope-level Resources and warnings; verify deterministic provider-origin results.
- [x] 4.4 Implement generic local FTS/typed-field search and exact Realm/Source filters using Profile-derived projections.
- [x] 4.5 Implement the planner's local-only/remote overrides, mixed-origin interleave, explain metadata, and provider-failure degradation tests.
- [x] 4.6 Implement Gmail `retrieve` plus generic `get <ref>` ad-hoc hydration; verify local cache reuse and synced/ad-hoc convergence.
- [x] 4.7 **Slice gate:** run mocked Gmail search/get integration and binary-CLI tests with sandboxed XDG state, then `bun run typecheck`, `bun run lint`, and `bun test`; no live provider traffic is permitted.
- [x] 4.8 **Human checkpoint — live Gmail read:** prepare an isolated persistent XDG/ctxindex test home and the exact OAuth command, then PAUSE for the user to complete browser login/MFA. After explicit confirmation, bind the chosen test mailbox to an explicit Realm/Source and run one bounded live search plus `get` on one returned Ref. Assert no provider write occurs, redact credentials/tokens from evidence, and preserve the sandbox for the later Draft checkpoint.

## 5. Thread Relations

- [x] 5.1 Add conversation-membership and parent Relation extractors to `communication.message`, including RFC message-id natural keys.
- [x] 5.2 Implement `thread get` as conversation union plus bidirectional parent traversal; verify out-of-order messages form a tree.
- [x] 5.3 Verify parentless conversations fall back to a flat date-ordered list and natural keys can join messages across Sources without identity collapse.
- [x] 5.4 **Slice gate:** run thread/Relation unit, integration, and binary-CLI tests plus `bun run typecheck`, `bun run lint`, and `bun test`; fix every failure before proceeding.

## 6. Artifacts and export

- [x] 6.1 Implement the content-addressed Artifact byte store and metadata writer with hash deduplication and disk accounting tests.
- [x] 6.2 Add Gmail attachment descriptors plus lazy Adapter download; verify uncached download, cached reuse, and `--output` copy semantics.
- [x] 6.3 Implement explicit Artifact purge and the first retention policy chosen by the owning capability spec before this task starts.
- [x] 6.4 Implement generic JSON export and one Profile-declared mail export; verify unsupported formats list valid registry-derived choices.
- [x] 6.5 **Slice gate:** run Artifact/download/export tests including purge and disk-accounting assertions, then `bun run typecheck`, `bun run lint`, and `bun test`; fix every failure before proceeding.

## 7. Provider Draft Actions

- [x] 7.1 Implement Action contract schemas, Adapter bindings, ActionContext construction, and pre-I/O input validation; verify declared-but-unimplemented, undeclared, and incompatible bindings fail.
- [x] 7.2 Implement registry-derived `action describe` and `action run` core/CLI paths with explicit Source selection and unsupported-Source errors.
- [x] 7.3 Implement Gmail `communication.message.draft.create`; verify the provider Draft is returned and materialized as a stable `communication.message` Ref.
- [x] 7.4 Implement Gmail `communication.message.draft.update`; verify it updates only the addressed Draft through the selected Source/Grant.
- [x] 7.5 Add negative contract tests proving V1 exposes no send/irreversible Action and composing text alone creates no ctxindex/provider state.
- [x] 7.6 **Slice gate:** run registry, Action core/CLI, and mocked Gmail Draft create/update tests; assert invalid input causes zero provider I/O and no send affordance exists; then run `bun run typecheck`, `bun run lint`, and `bun test`.
- [x] 7.7 **Human checkpoint — live Gmail Draft:** using the authenticated sandbox from 4.8, show the user the exact mailbox Source and uniquely labelled harmless Draft payload, then PAUSE for approval. After approval, run Draft create and update (never send), return/redact-safe Ref evidence, then PAUSE for the user to verify the Draft in the provider UI and optionally delete it. Mark complete only after explicit user confirmation that create/update were visible and no message was sent.

## 8. Local-directory Adapter

- [ ] 8.1 Define the minimal file Profile vocabulary needed by `local.directory` and bind it through the same public registries.
- [ ] 8.2 Rewrite local-directory Sync against generic Resources, safety limits, ignores, and non-fatal skip reporting; verify one sandboxed root end to end.
- [ ] 8.3 Verify local files use the same generic search/get/Ref envelope as Gmail with no domain-specific core path.
- [ ] 8.4 **Slice gate:** run sandboxed local-directory sync/search/get integration and binary-CLI tests plus `bun run typecheck`, `bun run lint`, and `bun test`; fix every failure before proceeding.

## 9. External tenders Extension proof

- [ ] 9.1 Author the tenders proof outside bundled packages using only public Profile/Adapter/Extension contracts and explicit-path configuration.
- [ ] 9.2 Verify its Resources participate in generic operations through the compiled binary and no bundled-only imports or hooks exist.
- [ ] 9.3 Remove the Extension and verify its Source becomes unavailable while local Resources remain searchable.
- [ ] 9.4 **Slice gate:** run the tenders proof through the relocated compiled binary, verify only public SDK imports, rerun D3, then run `bun run typecheck`, `bun run lint`, and `bun test`.

## 10. Generated docs and final validation

- [ ] 10.1 Generate CLI help, `ctxindex describe`, and agent reference material from loaded registries; remove any parallel hand-maintained kinds/fields/formats/Actions.
- [ ] 10.2 Update workflow-only bundled skills for the implemented V1 surface and verify required input remains non-interactive.
- [ ] 10.3 Run the final automated gate: `bun run ci`, `bun run test:integration`, `bun run test:e2e`, `./scripts/spikes/d3-compiled-extension/run.sh`, and `openspec validate v1-context-access-layer --strict`; fix every failure.
- [ ] 10.4 Exercise the complete V1 workflow: exact Realm-scoped discovery, get/thread retrieval, Artifact/export materialization, and provider Draft create/update with deterministic JSON and SPEC §12 exit behavior.
- [ ] 10.5 Run `openspec-verify-change`, resolve every mismatch, sync capability specs, and archive `v1-context-access-layer`.
