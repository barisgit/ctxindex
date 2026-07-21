## Why

ctxindex can already load a providerless tender Extension, but the example is an internal two-record proof rather than a launch-ready path. A fresh user cannot follow one documented, deterministic workflow from Extension installation through Source creation, Sync, search, field filtering, and complete retrieval without provider credentials or prepared local data. The public launch needs that instant proof before asking users to configure OAuth-backed providers.

## What Changes

- Promote the external tenders Extension into the single official instant-demo package.
- Require a useful deterministic fake corpus that exercises Sync, full-text search, typed fields, and complete Resource retrieval without provider access, secrets, or filesystem preparation.
- Require a copy-paste walkthrough for an isolated fresh installation, including the supported immutable Extension installation flow and actual output suitable for website reuse.
- Keep the demo providerless and explicitly synthetic; it does not add provider egress, authentication, Actions, or production procurement claims.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `extension-loading`: Strengthen the existing external tenders proof into the official deterministic providerless instant demo and define its minimum useful workflow.

## Impact

- Affects `examples/tenders-extension`, its package manifest, fixture data, tests, and Extension documentation tree.
- Adds launch documentation and captured deterministic output adjacent to the example for website reuse.
- Exercises the existing direct Extension installer and compiled CLI gates with a separately publishable package artifact, but does not introduce a new acquisition kind or security boundary.
- Stores only clearly synthetic package fixtures and requires no user data, credentials, Account, Grant, or provider network access.
