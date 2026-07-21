## Why

ctxindex needs an official real-network demo that proves a public, unauthenticated Provider-backed Extension without scraping or credentials. Public GitHub repository issues are familiar developer context and exercise safe network sync, pagination, local search, and stable retrieval while the existing tenders demo remains an offline fixture.

## What Changes

- Add a separately packaged official demo Extension for public GitHub repository issues.
- Define a no-auth GitHub Provider, an indexed issues Adapter, and a portable software-issue Profile through the public Extension SDK.
- Synchronize the complete repository issue collection through GitHub's official REST API with strict response, pagination, rate-limit, cancellation, and reconciliation safety.
- Reuse a first-page ETag only when the preceding complete snapshot was proven to fit on one page; never treat a page validator as a multi-page collection validator.
- Document bounded, credential-free demo commands and the handoff values needed to feature the Extension on the website after integration.

## Capabilities

### New Capabilities

- `github-issues-demo`: Official public GitHub Issues Extension definitions, sync behavior, safety limits, documentation, and demo workflow.

### Modified Capabilities

None.

## Impact

- Adds one workspace package under `examples/` using only `@ctxindex/extension-sdk` at runtime.
- Adds mocked HTTP and CLI end-to-end coverage; automated tests perform no live GitHub requests and require no credentials.
- Introduces read-only egress to `https://api.github.com` for configured public repository issue collections.
- Changes no core schema, built-in registry, CLI contract, authentication state, or existing demo behavior.
