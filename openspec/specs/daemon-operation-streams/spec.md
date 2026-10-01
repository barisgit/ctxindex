# daemon-operation-streams Specification

## Purpose
TBD - created by archiving change stream-daemon-operations. Update Purpose after archive.
## Requirements
### Requirement: Typed daemon operation event streams
Long-running daemon procedures that declare streaming MUST expose a closed typed
event sequence and one typed terminal return or declared error. Every yielded
event and terminal return MUST pass the authoritative RPC contract schema. Events
MUST be delivered in producer order and MUST remain strictly bounded; they MUST
NOT contain Resource payloads, provider bodies, cursors, secrets, raw paths,
stacks, causes, or unbounded diagnostics.

#### Scenario: Stream completes normally
- **WHEN** a client consumes a streamed daemon operation to completion
- **THEN** it receives each validated event in producer order followed by exactly one validated terminal return
- **THEN** the terminal return is not duplicated as a progress event

#### Scenario: Stream value violates the contract
- **WHEN** the application yields or returns a value outside the declared bounds
- **THEN** the stream fails through the bounded declared internal-error taxonomy and no unsafe value reaches the client

### Requirement: Backpressure and stream cleanup
A daemon operation stream MUST bound producer buffering independently of operation
length. Consumer progress MUST apply backpressure to the producer. Cancellation,
client disconnect, iterator return, or daemon shutdown MUST abort the request's
operation, finalize the iterator, and settle request tracking without cancelling
unrelated requests. A late producer result MUST NOT be reported as successful.

#### Scenario: Consumer stops early
- **WHEN** a client returns from the iterator before terminal completion
- **THEN** the request operation is aborted and producer/request resources settle without unbounded queued events

#### Scenario: Client cancels during progress
- **WHEN** a client aborts a streamed request after receiving progress
- **THEN** the operation observes cancellation and existing transactional rollback and Sync Run bookkeeping remain authoritative
