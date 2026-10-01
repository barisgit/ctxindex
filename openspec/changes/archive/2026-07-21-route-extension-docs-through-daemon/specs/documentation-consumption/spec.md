## ADDED Requirements

### Requirement: Documentation follows exact runtime ownership

The CLI MUST keep bundled product documentation local to its build-time bundle. When no daemon is selected, the CLI SHALL load the current direct Extension documentation projection and compose it with the bundled source. When exact runtime discovery or a test-only selector selects a daemon, every Extension documentation list, get, and search operation MUST use that daemon's immutable loaded projection and MUST NOT load Extension code in the CLI process.

A selected-daemon transport, protocol, runtime, lifecycle, cancellation, or application failure MUST be surfaced through the stable daemon failure mapping and MUST NOT fall back to direct Extension loading. Combined bundled and daemon Extension list/search results MUST preserve deterministic bundled-first, Extension-id, and logical-path ordering.

#### Scenario: Selected daemon supplies Extension documentation

- **WHEN** an agent invokes `ctxindex docs list`, `docs get --extension`, or `docs search` while an exact daemon is selected
- **THEN** bundled rows come from the CLI bundle and Extension rows or content come only from the selected daemon's loaded projection

#### Scenario: Selected daemon request fails

- **WHEN** a documentation command selects a daemon but its Extension documentation request fails
- **THEN** the command returns the mapped daemon failure and does not import or load Extensions directly

#### Scenario: No daemon is selected

- **WHEN** a documentation command runs in established direct mode
- **THEN** it composes the bundled source with the directly loaded Extension documentation projection without requiring a daemon
