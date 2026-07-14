## 1. Definition factories and typed registries

- [ ] 1.1 Create `packages/extension-sdk` with type-only public contracts and pure `defineProfile`, `defineAdapter`, and `defineExtension` factories; verify inferred ids/payloads and zero runtime-core imports.
- [ ] 1.2 Implement the Profile registry with runtime schema validation, `(id, version)` duplicate detection, unknown-version degradation, and focused unit tests.
- [ ] 1.3 Implement Adapter and Extension registries with capability/Action consistency checks and atomic Extension rejection tests.
- [ ] 1.4 Implement registry-derived `describe` data for kinds, aliases, fields, formats, Source config, and Actions; verify a fake Profile changes the described interface without hand-maintained vocabulary.

## 2. Explicit-path Extension loading

- [ ] 2.1 Add configuration for trusted explicit local Extension paths and dynamically import one external `.ts` fixture into the validated registries.
- [ ] 2.2 Inject only capability-specific host contexts, load built-ins first, and report atomic validation/id-conflict diagnostics; verify invalid Extensions activate nothing.
- [ ] 2.3 Integrate `scripts/spikes/d3-compiled-extension/run.sh` into CI and verify the relocated Bun 1.3.14 binary loads the external fixture and its own dependency.
- [ ] 2.4 Preserve materialized Resources and mark Sources unavailable when a configured Extension disappears; verify no implicit data deletion.

## 3. Generic Resource storage

- [ ] 3.1 Replace prototype schema definitions with the fresh core-owned Realm, Account, Grant, Source, Resource, field-index, chunk/FTS, Relation, Artifact, and Sync bookkeeping schema; initialize only fresh databases.
- [ ] 3.2 Implement transactional Resource upsert and Profile-derived field/chunk projection with one fake Profile; verify rollback leaves no partial projections.
- [ ] 3.3 Implement stable Source-scoped `ctx://` identity and `adhoc`/`synced` origin transitions; verify later Sync converges on the same Resource.
- [ ] 3.4 Implement synced tombstones and ad-hoc eviction semantics; verify deleted synced Resources remain addressable but excluded by default.
- [ ] 3.5 Implement Ref/natural-key Relation writes, lazy resolution, dangling-edge observability, and inverse traversal tests.
- [ ] 3.6 Implement cursor/run/lock transactions so successful Sync commits Resource writes and cursor together while failure advances neither.
- [ ] 3.7 Implement explicit Realm creation and exact Source/Realm/Grant binding; verify no `global` Realm is seeded and invalid or ambiguous bindings fail.

## 4. Minimal Gmail search and get

- [ ] 4.1 Define the minimal `communication.message` Profile payload, typed fields, search chunks, and docs required for Gmail search/get.
- [ ] 4.2 Rewrite Gmail auth and Source setup against declarative auth plus explicit Realm/Grant binding; verify mocked authorized HTTP uses only the linked Grant.
- [ ] 4.3 Implement Gmail `searchRemote` returning stable envelope-level Resources and warnings; verify deterministic provider-origin results.
- [ ] 4.4 Implement generic local FTS/typed-field search and exact Realm/Source filters using Profile-derived projections.
- [ ] 4.5 Implement the planner's local-only/remote overrides, mixed-origin interleave, explain metadata, and provider-failure degradation tests.
- [ ] 4.6 Implement Gmail `retrieve` plus generic `get <ref>` ad-hoc hydration; verify local cache reuse and synced/ad-hoc convergence.

## 5. Thread Relations

- [ ] 5.1 Add conversation-membership and parent Relation extractors to `communication.message`, including RFC message-id natural keys.
- [ ] 5.2 Implement `thread get` as conversation union plus bidirectional parent traversal; verify out-of-order messages form a tree.
- [ ] 5.3 Verify parentless conversations fall back to a flat date-ordered list and natural keys can join messages across Sources without identity collapse.

## 6. Artifacts and export

- [ ] 6.1 Implement the content-addressed Artifact byte store and metadata writer with hash deduplication and disk accounting tests.
- [ ] 6.2 Add Gmail attachment descriptors plus lazy Adapter download; verify uncached download, cached reuse, and `--output` copy semantics.
- [ ] 6.3 Implement explicit Artifact purge and the first retention policy chosen by the owning capability spec before this task starts.
- [ ] 6.4 Implement generic JSON export and one Profile-declared mail export; verify unsupported formats list valid registry-derived choices.

## 7. Provider Draft Actions

- [ ] 7.1 Implement Action contract schemas, Adapter bindings, ActionContext construction, and pre-I/O input validation; verify declared-but-unimplemented, undeclared, and incompatible bindings fail.
- [ ] 7.2 Implement registry-derived `action describe` and `action run` core/CLI paths with explicit Source selection and unsupported-Source errors.
- [ ] 7.3 Implement Gmail `communication.message.draft.create`; verify the provider Draft is returned and materialized as a stable `communication.message` Ref.
- [ ] 7.4 Implement Gmail `communication.message.draft.update`; verify it updates only the addressed Draft through the selected Source/Grant.
- [ ] 7.5 Add negative contract tests proving V1 exposes no send/irreversible Action and composing text alone creates no ctxindex/provider state.

## 8. Local-directory Adapter

- [ ] 8.1 Define the minimal file Profile vocabulary needed by `local.directory` and bind it through the same public registries.
- [ ] 8.2 Rewrite local-directory Sync against generic Resources, safety limits, ignores, and non-fatal skip reporting; verify one sandboxed root end to end.
- [ ] 8.3 Verify local files use the same generic search/get/Ref envelope as Gmail with no domain-specific core path.

## 9. External tenders Extension proof

- [ ] 9.1 Author the tenders proof outside bundled packages using only public Profile/Adapter/Extension contracts and explicit-path configuration.
- [ ] 9.2 Verify its Resources participate in generic operations through the compiled binary and no bundled-only imports or hooks exist.
- [ ] 9.3 Remove the Extension and verify its Source becomes unavailable while local Resources remain searchable.

## 10. Generated docs and final validation

- [ ] 10.1 Generate CLI help, `ctxindex describe`, and agent reference material from loaded registries; remove any parallel hand-maintained kinds/fields/formats/Actions.
- [ ] 10.2 Update workflow-only bundled skills for the implemented V1 surface and verify required input remains non-interactive.
- [ ] 10.3 Run fresh-database unit, integration, e2e, architecture, and D3 compiled-extension gates across all six capability specs.
- [ ] 10.4 Exercise the complete V1 workflow: exact Realm-scoped discovery, get/thread retrieval, Artifact/export materialization, and provider Draft create/update with deterministic JSON and SPEC §12 exit behavior.
- [ ] 10.5 Run `openspec-verify-change`, resolve every mismatch, sync capability specs, and archive `v1-context-access-layer`.
