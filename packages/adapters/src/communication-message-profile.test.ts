import { expect, test } from 'bun:test'
import {
  createExtensionRegistry,
  describeRegistry,
} from '@ctxindex/core/registry'
import { communicationMessageExtension } from '@ctxindex/profiles'

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
        aliases: ['message', 'email', 'mail'],
        fields: [
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
          {
            name: 'rfcMessageId',
            type: 'string',
            docs: 'Normalized RFC Message-ID header value.',
          },
          {
            name: 'conversationKey',
            type: 'string',
            docs: 'Source-scoped provider conversation identity.',
          },
        ],
        formats: [{ name: 'eml', mediaType: 'message/rfc822' }],
      },
    ],
    sources: [],
    actions: [],
  })
})
