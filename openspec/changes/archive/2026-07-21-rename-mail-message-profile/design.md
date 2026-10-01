## Context

The existing canonical message Profile is named for a broad communication domain but encodes email-specific payload and behavior. The repository is pre-alpha and the profiles package has not been publicly released, so correcting the vocabulary now avoids maintaining a misleading compatibility surface. Mailbox Adapters, generated registry metadata, CLI fixtures, documentation, and tests all consume the same Profile and Action identifiers.

## Goals / Non-Goals

**Goals:**

- Give the existing email contract the precise `mail.message@1` identity.
- Keep Google and Microsoft mailbox behavior aligned on one canonical email Profile.
- Keep email conversation/reply Relations traversable through the generic core thread service.
- Remove stale current-facing references before publication.

**Non-Goals:**

- Designing or implementing a chat Profile.
- Changing the email payload, provider permissions, Draft mutation behavior, EML output, or core threading algorithm.
- Migrating released or persistent user data, or preserving the old identifiers as aliases.

## Decisions

1. Rename the Profile, Actions, public TypeScript symbols, filenames, and package subpath as one atomic breaking vocabulary change. Keeping generic TypeScript names or a legacy subpath would leave a second source of misleading public terminology.
2. Preserve the schema and all email semantics unchanged. `mail.message` retains RFC headers and identifiers, To/Cc/Bcc, subject, MIME/EML export, attachment descriptors, typed fields, and reversible Draft create/update contracts.
3. Preserve `conversation` and `parent` Relation names and targets. These relation types are generic structural vocabulary consumed by provider-neutral core traversal and can also be used by future domain Profiles.
4. Do not add aliases, migration logic, dual Action bindings, or deprecated exports. There is no released compatibility obligation, and parallel identities would make registry behavior ambiguous.
5. Treat archived OpenSpec changes and completed historical milestone records as historical evidence. Current specifications, active changes, source, tests, examples, generated/reference docs, and codemaps must contain only the new vocabulary.

## Risks / Trade-offs

- Public-looking examples or fixtures may retain the old id accidentally → Add a stale-reference verifier covering current-facing surfaces while excluding clearly historical archives and completed milestone records.
- The broad rename may obscure a semantic regression → Keep payload and behavior assertions intact and add focused identity/Action regression tests before implementation.
- Concurrent package-directory renaming may conflict mechanically → Keep this branch scoped to Profile vocabulary and mailbox consumers, then rebase the package rename branch with path-aware conflict resolution.

## Migration Plan

Not applicable. The project is pre-release and this change intentionally replaces the old identifiers without compatibility aliases or persisted-state migration.

## Open Questions

None.
