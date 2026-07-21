import { expect, test } from 'bun:test'
import {
  createExtensionRegistry,
  describeRegistry,
} from '@ctxindex/core/registry'
import { defineExtension } from '@ctxindex/extension-sdk'
import { communicationMessageProfile } from '@ctxindex/profiles/communication-message'

const communicationMessageExtension = defineExtension({
  id: 'ctxindex.communication-message.test',
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
        id: 'communication.message.draft.create',
        profile: { id: 'communication.message', version: 1 },
        effect: 'reversible',
        input: expect.anything(),
        output: { id: 'communication.message', version: 1 },
        adapters: [],
      },
      {
        id: 'communication.message.draft.update',
        profile: { id: 'communication.message', version: 1 },
        effect: 'reversible',
        input: expect.anything(),
        output: { id: 'communication.message', version: 1 },
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
