## ADDED Requirements

### Requirement: Observable sync progress
Sync orchestration MUST optionally report ordered provider-neutral progress through
an awaited observer. For every selected Source it MUST report Source start before
provider work, cumulative count-only progress after each validated Adapter
emission, and exactly one Source completed or failed event before advancing to the
next Source. Progress counts MUST distinguish observed upserts, removals,
checkpoints, and warnings and MUST NOT imply commit before successful completion.

The observer MUST receive no Resource payload, Ref, cursor, provider response,
secret, or host path. Omitting the observer MUST preserve the existing terminal
result and storage behavior.

#### Scenario: Adapter emits work and completes
- **WHEN** one Source emits validated upserts, a checkpoint, and a warning before completing
- **THEN** the observer receives Source start, monotonically cumulative count-only progress in emission order, and one Source completed event
- **THEN** the final aggregate result retains the same committed counts and warning semantics

#### Scenario: Source fails after progress
- **WHEN** a Source emits progress and then fails
- **THEN** the observer receives that progress followed by exactly one Source failed event with the existing failure diagnostics
- **THEN** transactional cursor and materialization guarantees remain unchanged
