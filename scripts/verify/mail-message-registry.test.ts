import { expect, test } from 'bun:test'
import {
  createExtensionRegistry,
  describeRegistry,
} from '@ctxindex/core/registry'
import { defineExtension } from '@ctxindex/extension-sdk'
import { mailMessageProfile } from '@ctxindex/profiles/mail-message'

const mailMessageExtension = defineExtension({
  id: 'ctxindex.mail-message.test',
  profiles: [mailMessageProfile],
  adapters: [],
})

test('bundled mail.message enters the public registry path', () => {
  const description = describeRegistry(
    createExtensionRegistry([mailMessageExtension]),
  )

  expect(description).toEqual({
    kinds: [
      {
        id: 'mail.message',
        version: 1,
        fields: [
          {
            name: 'conversationKey',
            type: 'string',
          },
          {
            name: 'rfcMessageId',
            type: 'string',
          },
          {
            name: 'sender',
            type: 'string[]',
          },
          {
            name: 'unread',
            type: 'boolean',
          },
        ],
        formats: [{ name: 'eml', mediaType: 'message/rfc822' }],
      },
    ],
    sources: [],
    actions: [
      {
        id: 'mail.message.draft.create',
        profile: { id: 'mail.message', version: 1 },
        effect: 'reversible',
        input: expect.anything(),
        output: { id: 'mail.message', version: 1 },
        adapters: [],
      },
      {
        id: 'mail.message.draft.update',
        profile: { id: 'mail.message', version: 1 },
        effect: 'reversible',
        input: expect.anything(),
        output: { id: 'mail.message', version: 1 },
        adapters: [],
      },
    ],
  })
  const [create, update] = description.actions as Array<{
    input: {
      anyOf?: Array<{
        required?: string[]
        properties?: Record<string, unknown>
        additionalProperties?: boolean
      }>
    }
  }>
  expect(create?.input.anyOf?.map((branch) => branch.required)).toEqual([
    ['to', 'subject', 'bodyText'],
    ['replyToRef', 'bodyText'],
  ])
  expect(
    create?.input.anyOf?.every(
      (branch) =>
        branch.additionalProperties === false &&
        branch.properties?.attachments !== undefined,
    ),
  ).toBe(true)
  expect(
    update?.input.anyOf?.every(
      (branch) =>
        branch.additionalProperties === false &&
        branch.properties?.attachments === undefined,
    ),
  ).toBe(true)
  const actionDescription = JSON.stringify(description.actions)
  expect(actionDescription).not.toMatch(/gmail|provider/i)
})
