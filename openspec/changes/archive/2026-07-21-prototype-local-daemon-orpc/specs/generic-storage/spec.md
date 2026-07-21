## ADDED Requirements

### Requirement: Canonical database lease enforces exclusive SQLite ownership
Before opening SQLite on a platform with a supported retained-lease backend, a production daemon MUST hold an exclusive retained kernel file lease keyed by the canonical SQLite path after symlink/alias resolution. Every direct production SQLite opener on that platform MUST acquire and retain a shared lease on the same key from before database open until after database close. Multiple shared direct owners MAY coexist; they MUST block daemon exclusivity, and daemon exclusivity MUST block every direct opener. A daemon MUST retain exclusivity for the complete lifetime of its open handle, including shutdown timeout, and release it only after the handle is closed or by process termination.

On Darwin the permanent lock file MUST be `<canonical-sqlite>.owner.lock`, opened through `node:fs` with `O_EXLOCK | O_NONBLOCK` for daemon ownership or `O_SHLOCK | O_NONBLOCK` for direct ownership and mode `0600`. Acquisition MUST reject a symlink, non-regular file, wrong uid, or non-private mode. The lock file MUST NOT be unlinked. Kernel release after normal exit or SIGKILL MUST make it immediately reacquirable. An unsupported platform MUST reject daemon startup before SQLite open; because no daemon can own the database there, legacy direct commands MUST retain their pre-prototype unleased behavior. An unavailable locking primitive or unsupported filesystem on Darwin MUST fail closed before any production SQLite open.

The permanent lease file MUST NOT publish or supply runtime-owner attribution. Conflict reporting MUST remain holder-neutral because lease-file contents cannot be bound to the retained kernel-lock holder and may be stale, including while a shared holder owns the lease.

When exact-tuple metadata or a test override selects RPC for the partial slice, the command MUST NOT fall back to direct open. Before every direct/unconverted stateful CLI path composes a runtime or opens SQLite, it MUST attempt retained shared acquisition for the canonical database. Exclusive conflict MUST fail `prototype_unsupported` with exit `50` before database open. Successful acquisition MUST remain held until after close, while other direct behavior remains unchanged. Test-only storage MAY open an isolated database not owned by a live production daemon.

#### Scenario: Client performs a storage-backed operation
- **WHEN** a local client invokes a storage-backed operation for a state root with a ready daemon
- **THEN** the daemon performs the storage access and the client process does not open SQLite

#### Scenario: Selected daemon route is unreachable
- **WHEN** exact-tuple metadata or a test override selected RPC and no ready daemon is reachable
- **THEN** the client reports daemon unavailability and does not open SQLite as a fallback

#### Scenario: Unconverted stateful command is fenced
- **WHEN** an unconverted stateful command targets a canonical SQLite path whose database lease is held by a daemon
- **THEN** it fails `prototype_unsupported` with exit 50 before composing a direct runtime or opening SQLite

#### Scenario: Unconverted command retains direct behavior after shared acquisition
- **WHEN** an unconverted stateful command successfully acquires a shared lease for its canonical SQLite path
- **THEN** it acquires a shared database lease, retains it around open/use/close, and otherwise preserves existing direct behavior

#### Scenario: Direct processes block daemon acquisition
- **WHEN** one or more legacy direct stateful processes hold shared leases for the canonical SQLite path
- **THEN** daemon exclusive acquisition fails before SQLite open until every shared owner closes

#### Scenario: Process death releases the retained lease
- **WHEN** a lease-owning process is terminated by SIGKILL
- **THEN** the kernel releases its lock and a later compatible owner can acquire immediately without deleting or aging the permanent lock file

#### Scenario: Unsafe or unsupported lock fails closed
- **WHEN** the lock target is a symlink, non-regular, wrong-owner, non-private, or a supported platform's filesystem cannot provide the required retained lock
- **THEN** the process fails before opening SQLite

#### Scenario: Unsupported platform retains legacy direct behavior
- **WHEN** the operating system has no retained-lease backend and a direct CLI command has not selected a daemon
- **THEN** daemon startup remains unavailable and the direct command opens SQLite through its pre-prototype path without asserting a retained lease

#### Scenario: Different state roots share one data root
- **WHEN** daemons with different canonical state roots resolve the same canonical SQLite path
- **THEN** at most one holds the database lease and opens SQLite

#### Scenario: Shutdown timeout keeps the database fenced
- **WHEN** shutdown times out waiting for a non-cooperative request
- **THEN** the daemon retains its open database handle and database lease and no other production process may open that SQLite path

#### Scenario: Isolated storage test remains independent
- **WHEN** an automated test opens a database under a test-only isolated state root with no live production daemon for that root
- **THEN** the test may exercise storage directly without weakening production daemon ownership
