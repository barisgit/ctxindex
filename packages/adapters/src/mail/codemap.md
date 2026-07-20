# packages/adapters/src/mail/

## Responsibility

Owns provider-shared internal email transport preparation without defining an Adapter or provider route.

## Design and flow

`mime.ts` resolves ordered `ActionArtifact` values through the host callback while passing the decreasing portable byte allowance, validates safe immutable metadata and count/aggregate-byte bounds, then renders deterministic CRLF single-part or multipart MIME. Attachments use folded base64, encoded Unicode filenames, and a content-derived boundary proven absent from the rendered inputs. Missing or oversized cache bytes fail before allocation and before any provider fetch; missing bytes include explicit download guidance.

## Integration points

Consumed only by the Gmail and Microsoft mailbox Draft handlers. It depends on portable limits from `@ctxindex/profiles`, generic resolved Artifact values from `@ctxindex/extension-sdk`, and typed validation errors from `@ctxindex/core`.
