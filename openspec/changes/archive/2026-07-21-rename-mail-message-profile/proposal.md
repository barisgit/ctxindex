## Why

The bundled `communication.message@1` Profile is an email contract despite its generic name: it contains RFC message headers, email recipients, MIME export, attachments, and email Draft Actions. Before the canonical profiles package is published, the public vocabulary should name that domain accurately so future chat Profiles can use their own schema without inheriting misleading email semantics.

## What Changes

- **BREAKING**: Rename the bundled email Profile from `communication.message@1` to `mail.message@1` with no compatibility alias or migration.
- **BREAKING**: Rename the email Draft Actions to `mail.message.draft.create` and `mail.message.draft.update`.
- Rename the public schema, payload type, Draft schemas, helper exports, package subpath, and current-facing generated/documented vocabulary to use `mail.message` terminology while preserving the existing email payload and behavior.
- Update the Google and Microsoft mailbox Source Adapters to emit `mail.message@1` Resources and bind the renamed Draft Actions.
- Preserve generic `conversation` and `parent` Relations and provider-neutral thread traversal.
- Guard current-facing surfaces against stale `communication.message` references; clearly historical archived change records remain unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `profile-vocabulary`: Rename the canonical email Profile and its public TypeScript vocabulary while preserving its email schema, exports, fields, Relations, Artifacts, and documentation.
- `provider-actions`: Rename the two reversible email Draft Action contracts and their normalized Resource outputs.
- `microsoft-graph-adapters`: Emit the renamed Profile and bind the renamed Draft Actions without changing Graph behavior.
- `core-model`: Refer to the email-specific RFC field through the renamed Profile while preserving generic Relations and thread traversal.
- `retrieval-and-artifacts`: Retrieve complete email Resources through the renamed Profile without changing generic retrieval or Artifact behavior.

## Impact

The change affects `@ctxindex/profiles`, the bundled Google and Microsoft mailbox Source Adapters, registry and CLI fixtures/examples, current OpenSpec specifications and implementation sidecars, web and agent-facing documentation, codemaps, and focused/compiled tests. It changes public Profile, Action, TypeScript export, and package-subpath identifiers before publication. It does not change stored-data migration behavior, network permissions, provider mutation scope, or the generic core threading contract.
