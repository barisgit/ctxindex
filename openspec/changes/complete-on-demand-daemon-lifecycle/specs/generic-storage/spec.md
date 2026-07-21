## ADDED Requirements

### Requirement: Linux retained ownership matches Darwin daemon safety
Linux MUST provide process-retained non-blocking shared and exclusive ownership for the permanent canonical lease files with the same observable safety guarantees as Darwin: alias-safe contention, multiple shared direct owners during migration, exclusive daemon ownership, owner-private regular files, rejection of symlinks and unsafe ownership or mode, release on close or process death, and immediate reacquisition without unlinking the lease file.

An advertised Linux daemon MUST retain exclusive database ownership from before SQLite open until after database close, including request drain and shutdown timeout. If the primitive or filesystem cannot supply these guarantees, daemon startup and initialized stateful commands MUST fail before SQLite open rather than use an unleased or direct fallback.

#### Scenario: Linux shared owners block daemon exclusivity
- **WHEN** one or more Linux direct migration paths retain shared ownership of a canonical database lease
- **THEN** an on-demand daemon cannot acquire exclusivity or open that SQLite database until every shared owner releases it

#### Scenario: Linux daemon blocks every direct opener
- **WHEN** a Linux daemon retains the exclusive canonical database lease
- **THEN** every direct production opener fails before SQLite open

#### Scenario: Linux process death releases ownership
- **WHEN** a Linux lease-owning process is terminated without cleanup
- **THEN** the operating system releases its retained ownership and a later compatible process can reacquire immediately without deleting the permanent lease file

#### Scenario: Linux alias paths identify one lease
- **WHEN** contenders address the same lease file or SQLite database through canonicalizable path aliases
- **THEN** they contend for the same retained ownership rather than opening independent runtimes
