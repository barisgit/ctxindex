import { expect, test } from 'bun:test'
import {
  createExtensionRegistry,
  describeRegistry,
} from '@ctxindex/core/registry'
import { defineExtension } from '@ctxindex/extension-sdk'
import { communicationMessageProfile } from '@ctxindex/profiles/communication-message'

const communicationMessageExtension = defineExtension({
  id: 'ctxindex.communication-message.test',
  version: 1,
  profiles: [communicationMessageProfile],
  adapters: [],
})

test('bundled communication.message enters the public registry path', () => {
  const description = describeRegistry(
    createExtensionRegistry([communicationMessageExtension]),
  )

  expect(description).toEqual({
    kinds: [
      {
        id: 'communication.message',
        version: 1,
        summary: 'An email or provider message.',
        aliases: ['email', 'mail', 'message'],
        fields: [
          {
            name: 'conversationKey',
            type: 'string',
            docs: 'Source-scoped provider conversation identity.',
          },
          {
            name: 'rfcMessageId',
            type: 'string',
            docs: 'Normalized RFC Message-ID header value.',
          },
          {
            name: 'sender',
            type: 'string[]',
            docs: 'Sender addresses associated with the message.',
          },
          {
            name: 'unread',
            type: 'boolean',
            docs: 'Whether the message is unread.',
          },
        ],
        formats: [{ name: 'eml', mediaType: 'message/rfc822' }],
      },
    ],
    sources: [],
    actions: [
      {
        id: 'communication.message.draft.create',
        profile: { id: 'communication.message', version: 1 },
        effect: 'reversible',
        input: expect.objectContaining({
          anyOf: expect.arrayContaining([
            expect.objectContaining({
              required: ['to', 'subject', 'bodyText'],
            }),
            expect.objectContaining({
              required: ['replyToRef', 'bodyText'],
            }),
          ]),
        }),
        output: { id: 'communication.message', version: 1 },
        docs: 'Create a Draft in the selected mailbox Source.',
        examples: [
          {
            to: ['recipient@example.com'],
            subject: 'Project update',
            bodyText: 'The project is on track.',
          },
          {
            replyToRef:
              'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/message/stable-message-id',
            bodyText: 'Thanks for the update.',
          },
        ],
        adapters: [],
      },
      {
        id: 'communication.message.draft.update',
        profile: { id: 'communication.message', version: 1 },
        effect: 'reversible',
        input: expect.objectContaining({
          anyOf: expect.arrayContaining([
            expect.objectContaining({
              required: ['ref', 'to', 'subject', 'bodyText'],
            }),
            expect.objectContaining({
              required: ['ref', 'replyToRef', 'bodyText'],
            }),
          ]),
        }),
        output: { id: 'communication.message', version: 1 },
        docs: 'Replace the complete content of the addressed Draft in the selected mailbox Source.',
        examples: [
          {
            ref: 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/draft/stable-draft-id',
            to: ['recipient@example.com'],
            subject: 'Updated project status',
            bodyText: 'The project is ready for review.',
          },
          {
            ref: 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/draft/stable-draft-id',
            replyToRef:
              'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/message/stable-message-id',
            bodyText: 'Updated reply text.',
          },
        ],
        adapters: [],
      },
    ],
  })
  const actionDescription = JSON.stringify(description.actions)
  expect(actionDescription).not.toMatch(/gmail|provider/i)
})
