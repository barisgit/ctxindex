import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import {
  createExtensionRegistry,
  describeRegistry,
} from '@ctxindex/core/registry'
import { defineExtension } from '@ctxindex/extension-sdk'
import {
  mailMessageDraftCreateInputSchema,
  mailMessageDraftUpdateInputSchema,
  mailMessageProfile,
} from '@ctxindex/profiles/mail-message'

const mailMessageExtension = defineExtension({
  id: 'ctxindex.mail-message.test',
  profiles: [mailMessageProfile],
  adapters: [],
})

test('bundled mail.message is the only canonical email Profile identity', async () => {
  const description = describeRegistry(
    createExtensionRegistry([mailMessageExtension]),
  )

  expect(mailMessageProfile.id).toBe('mail.message')
  expect(description.kinds.map(({ id }) => id)).toEqual(['mail.message'])
  expect(description.actions).toEqual([
    expect.objectContaining({
      id: 'mail.message.draft.create',
      profile: { id: 'mail.message', version: 1 },
      input: expect.anything(),
      output: { id: 'mail.message', version: 1 },
    }),
    expect.objectContaining({
      id: 'mail.message.draft.update',
      profile: { id: 'mail.message', version: 1 },
      input: expect.anything(),
      output: { id: 'mail.message', version: 1 },
    }),
  ])
  expect(
    mailMessageDraftCreateInputSchema.safeParse({
      to: ['recipient@example.test'],
      subject: 'Subject',
      bodyText: 'Body',
    }).success,
  ).toBe(true)
  expect(
    mailMessageDraftUpdateInputSchema.safeParse({
      ref: 'ctx://source/draft/one',
      to: ['recipient@example.test'],
      subject: 'Subject',
      bodyText: 'Body',
    }).success,
  ).toBe(true)

  const packageJson = JSON.parse(
    await readFile(
      new URL('../../packages/profiles/package.json', import.meta.url),
      'utf8',
    ),
  ) as { exports: Record<string, string> }
  expect(packageJson.exports['./mail-message']).toBe('./src/mail-message.ts')
  expect(
    packageJson.exports[`./${['communication', 'message'].join('-')}`],
  ).toBeUndefined()
})
