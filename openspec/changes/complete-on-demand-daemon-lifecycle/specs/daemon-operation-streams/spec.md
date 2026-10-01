## ADDED Requirements

### Requirement: Stream lifetime participates in daemon activity
An admitted daemon operation stream MUST count as one active business request from successful admission until its iterator and request tracking settle. Automatic idle expiry MUST NOT stop or cancel the daemon while any stream is active. Completion, declared failure, cancellation, client disconnect, iterator return, and producer failure MUST each settle activity exactly once and start a new idle interval only when no other business request remains active.

Automatic daemon ensure MUST complete before the CLI opens a declared stream. It MUST NOT replace typed sync progress with polling, buffered terminal-only output, an untyped command tunnel, or a background queue.

#### Scenario: Sync starts the daemon and streams progress
- **WHEN** `sync` is invoked for an initialized runtime with no live daemon
- **THEN** the CLI ensures one compatible daemon before opening the typed sync stream
- **THEN** validated progress events and the terminal outcome retain their existing producer order, backpressure, cancellation, and bounds

#### Scenario: Backpressured stream prevents idle shutdown
- **WHEN** a typed operation stream remains active while its consumer applies backpressure beyond the idle duration
- **THEN** the daemon remains ready for that admitted stream and does not cancel it because of idle expiry

#### Scenario: Cancelled stream settles activity
- **WHEN** a client cancels or abandons an admitted stream
- **THEN** stream cleanup and request activity settle exactly once
- **THEN** the idle interval begins only after no other business request remains active
