## Why

The portable email Draft Actions can persist standalone Drafts, but they cannot create a provider-native reply to an existing message or preserve its thread identity. Threaded replies are independently deliverable without the unresolved attachment-update atomicity from issue #5, and they let agents prepare reversible replies without adding send capability.

## What Changes

- Extend the existing portable Draft create and update inputs with strict, mutually exclusive reply branches while leaving standalone inputs unchanged.
- Require reply parents and reply Drafts to resolve from complete local Resources in the exact selected Source before authentication or provider I/O.
- Derive reply recipient, subject, and portable threading metadata from the parent message; callers cannot override them and reply-all remains unsupported.
- Create provider-native reply Drafts with one no-retry mutation and update existing reply Drafts without changing their reply parent.
- Return and locally materialize complete Draft Resources with stable Refs and immutable reply context.
- Keep email sending, attachments, provider reads during validation, provider-specific Action schemas, and provider-specific CLI commands out of scope.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `profile-vocabulary`: Add the portable message fields and strict Draft reply input branches needed for provider-independent reply semantics.
- `provider-actions`: Define Source-scoped local Resource resolution and validation for reversible threaded reply Draft creation and update.
- `microsoft-graph-adapters`: Use Graph's native reply-Draft creation and preserve reply context during one-shot Draft updates.
- `retrieval-and-artifacts`: Require locally complete message data and provider threading metadata needed by reply Actions.

## Impact

The change affects `@ctxindex/profiles`, the public `ActionContext` seam in `@ctxindex/extension-sdk`, generic Action orchestration and storage in `@ctxindex/core`, Gmail and Microsoft mailbox adapters in `@ctxindex/official`, generated registry documentation, and mocked CLI workflows. It adds no provider permissions, no new persistence tables or migrations, no provider reads before mutations, and no irreversible effects.
