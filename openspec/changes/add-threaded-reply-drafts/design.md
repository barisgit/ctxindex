## Context

Standalone Draft Actions already validate portable inputs, perform one no-retry provider mutation, return a complete message Resource, and materialize it locally. Reply Drafts additionally depend on a locally available parent message and provider-native thread identity. The Action must reject invalid local state before authentication or network work, and the provider adapters cannot fetch missing parent or Draft details during validation.

Microsoft Graph exposes a one-shot `POST /me/messages/{id}/createReply` operation returning a Draft message and permits later `PATCH /me/messages/{draft-id}` updates to Draft body, subject, and recipients. Gmail accepts a complete RFC 5322 message plus `threadId` in one `drafts.create` or `drafts.update` mutation.

## Goals / Non-Goals

**Goals:**

- Create provider-native single-recipient reply Drafts through the existing portable Actions.
- Derive every reply property except body text from a complete local parent.
- Preserve one-mutation, no-retry, stable-Ref, and no-send guarantees.
- Prove reply parent immutability on update without provider reads.

**Non-Goals:**

- Attachments, reply-all, sending, provider-specific Actions or CLI paths.
- Hydrating incomplete Resources during an Action.
- Changing standalone Draft semantics.

## Decisions

1. Draft create/update inputs become strict unions. A standalone branch retains its existing exact shape. A reply create branch accepts only `replyToRef` and `bodyText`; reply update adds only the addressed Draft `ref`. This makes mixed semantics and caller overrides schema-invalid before Action dispatch.

2. Action adapters receive a generic Source-scoped local Resource resolver from core. The resolver accepts a Ref and returns local stored state only when the Ref belongs to the selected Source; it performs no provider I/O and contains no message-specific logic. Adapters apply Profile, completeness, deletion, Draft, and threading-field rules.

3. The portable message payload gains only reply-relevant data: ordered Reply-To addresses, ordered RFC References, and `replyToRef` on reply Draft results. Existing `internetMessageId`, `inReplyTo`, provider conversation ids, From addresses, subject, and completeness already cover the remainder. `replyToRef` is absent on ordinary messages and standalone Drafts.

4. Reply recipient is the first Reply-To address, falling back to the first From address. Reply subject is `Re: ` plus the parent subject after removing any leading case-insensitive repeated `Re:` prefixes; an empty parent subject produces `Re:`. This is deterministic and independent of caller input.

5. Gmail builds one complete MIME message with `To`, derived `Subject`, `In-Reply-To`, and `References`; the mutation body also carries the parent's `threadId`. The References chain is the parent's stored References followed by its Message-ID, without duplicates.

6. Microsoft create calls native `createReply` once with MIME content that sets text body, derived recipient, and subject. The returned Draft is normalized with the selected parent Ref. Update first resolves both the target Draft and requested parent locally, proves the stored Draft `replyToRef` equals the input, then PATCHes body, recipient, and subject once. No Graph read is needed because Graph preserves the native reply association created earlier.

7. Missing required local reply data fails as validation with guidance to retrieve the message first. This includes missing Message-ID/thread id for Gmail and any incomplete parent payload. No authentication, token refresh, or provider fetch begins before this validation.

## Risks / Trade-offs

- [Provider-native derived subject can differ from local derivation] -> Send the same deterministic subject explicitly and assert normalized output matches it.
- [Locally cached old Drafts lack `replyToRef`] -> Treat them as standalone Drafts and reject reply-branch updates; no compatibility migration is added in pre-alpha.
- [Reply-To or From may be absent] -> Fail before I/O with retrieval guidance rather than guess a recipient.
- [Graph response may omit a portable field] -> Construct the returned complete Draft from validated local inputs plus response identity while retaining provider-returned canonical identifiers.

## Migration Plan

No schema migration is required. The added payload fields are optional, and Action inputs are validated at runtime. Existing standalone Drafts and stored messages remain valid.

## Open Questions

None.
