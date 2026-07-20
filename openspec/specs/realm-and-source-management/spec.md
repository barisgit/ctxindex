# Realm And Source Management Specification

## Purpose
Define Source collection granularity, Realm membership, Grant binding, and exact Realm search scope.

## Requirements

### Requirement: Source granularity
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

A mailbox source MUST represent exactly one mailbox.

A calendar source MUST represent exactly one specific calendar, not every calendar visible to an account.

A local directory source MUST represent one configured root directory. Each indexed file in that directory source SHOULD map to one resource, and extracted text SHOULD map to zero or more chunks.

A local directory source SHOULD support plain text and common source-code files as text inputs at minimum. Code-aware parsing MAY be added later, but source code SHOULD remain searchable as text without specialized parsing.

A local directory source SHOULD support per-source include/exclude globs, built-in default ignores for noisy directories, and `.gitignore`-compatible ignore rules where applicable.

A local directory source SHOULD NOT expose a broad "ignore all ignore files" switch as the normal override. It SHOULD instead support an explicit ctxindex-specific ignore/allow file named `.ctxindexignore`, whose gitignore-style negation rules can intentionally re-include paths ignored by `.gitignore`.

A local directory source SHOULD enforce file size and binary detection limits by default. Skipped files SHOULD be reported in the sync run counts or error summary without failing the whole sync.

One extension MAY provide multiple source adapters, such as mailbox, calendar, and Drive. Each source still uses exactly one source adapter.

#### Scenario: Each Source represents exactly one configured provider collection
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

### Requirement: Realm membership and exact filtering
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

A realm is a user-defined operating context and search scope, such as `personal`, `company`, or `university`. ctxindex MUST support multiple user-created realms and MUST NOT assign special semantics to a `global` realm.

Every source MUST belong to exactly one explicitly selected existing realm. Source creation without a realm MUST fail with an actionable error. A realm MAY contain sources from any provider, account, or source adapter.

Realms MUST NOT be treated as a security boundary. Credentials, grants, and account isolation MUST be enforced at the account/grant level, not by realm membership.

Multiple sources MAY use the same account or grant across different realms when the provider permits it.

Every source whose adapter requires authentication MUST store an internal explicit `grant_id` link when created and while authenticated. Source creation MUST resolve public `--account` input by exact Account label, then Account id, considering only Accounts for the adapter's declared provider, and bind that Account's one stable compatible Grant. Grant ids MUST NOT be accepted as public selectors. Creation MUST fail when the reference is absent, unknown, provider-incompatible, or lacks required scopes. A Source preserved after Account removal MAY have its link cleared and MUST report `needs_auth` until recreated. Sync and federated search MUST resolve credentials only through the source's linked Grant and MUST NOT select a global "active" or most-recent Grant.

Search MUST consider all realms when no realm filter is provided. Callers MUST be able to filter to one or more realms, and an explicit realm filter MUST be exact: no additional realm is implicitly included.

#### Scenario: Every Source belongs to one selected Realm and explicit filters remain exact
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings
