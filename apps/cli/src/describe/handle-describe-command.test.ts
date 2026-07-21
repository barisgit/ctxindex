import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { handleDescribeCommand } from './handle-describe-command'

afterEach(() => {
  spyOn(console, 'error').mockRestore()
  spyOn(console, 'log').mockRestore()
})

describe('describe command validation', () => {
  test('routes an exact source-aware Action description without running an Action', async () => {
    let received: unknown

    expect(
      await handleDescribeCommand(
        {
          selector: 'action',
          id: 'mail.draft.create',
          format: 'json',
          full: false,
          sourceId: 'work-mail',
        },
        (async (input: unknown) => {
          received = input
          return 0
        }) as typeof import('../action/handle-action-command').handleActionCommand,
      ),
    ).toBe(0)
    expect(received).toEqual({
      kind: 'describe',
      actionId: 'mail.draft.create',
      sourceId: 'work-mail',
      json: true,
    })
  })

  test('describes an exact Action from loaded definitions without database-backed availability', async () => {
    let output = ''
    spyOn(console, 'log').mockImplementation((value) => {
      output = String(value)
    })

    expect(
      await handleDescribeCommand(
        {
          selector: 'action',
          id: 'communication.message.draft.create',
          format: 'json',
          full: false,
        },
        async () => {
          throw new Error('database-backed Action description was used')
        },
      ),
    ).toBe(0)
    expect(JSON.parse(output)).toMatchObject({
      id: 'communication.message.draft.create',
      profile: { id: 'communication.message', version: 1 },
      effect: 'reversible',
      adapters: [{ id: 'google.mailbox' }, { id: 'microsoft.mailbox' }],
    })
  })

  test.each([
    {
      selector: 'profile',
      id: 'mail.message',
      format: 'text' as const,
      full: false,
      sourceId: 'mail',
    },
    {
      selector: 'action',
      id: 'mail.draft.create',
      format: 'markdown' as const,
      full: false,
    },
    {
      selector: 'adapter',
      id: 'mail.adapter',
      format: 'text' as const,
      full: true,
    },
  ])('rejects semantic misuse before loading definitions: %j', async (input) => {
    spyOn(console, 'error').mockImplementation(() => {})

    expect(await handleDescribeCommand(input)).toBe(2)
  })
})
