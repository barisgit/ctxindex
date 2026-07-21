import { describe, expect, test } from 'bun:test'
import { runCommand } from 'citty'
import { defineCtxCommand } from '../command-model'
import { resolveSearchArgs, searchArgs } from './search'

async function resolve(rawArgs: string[]) {
  let resolved: ReturnType<typeof resolveSearchArgs> | undefined
  const command = defineCtxCommand({
    meta: { name: 'search' },
    args: searchArgs,
    run: ({ args }) => {
      resolved = resolveSearchArgs(args)
    },
  })
  await runCommand(command, { rawArgs })
  return resolved
}

describe('search CLI arguments', () => {
  test('resolves repeatable Realm, Source, and typed field filters in order', async () => {
    expect(
      await resolve([
        'project',
        '--realm',
        'work',
        '--realm=personal',
        '--source',
        'mail',
        '--source=calendar',
        '--kind',
        'communication.message',
        '--field',
        'sender=alice@example.com',
        '--field=unread=true',
        '--remote',
        '--json',
      ]),
    ).toEqual({
      format: 'json',
      refs: false,
      input: {
        text: 'project',
        realms: ['work', 'personal'],
        sourceIds: ['mail', 'calendar'],
        kind: 'communication.message',
        fields: [
          { name: 'sender', value: 'alice@example.com' },
          { name: 'unread', value: 'true' },
        ],
        remote: true,
      },
    })
  })

  test('accepts filter-only enumeration and exact remote continuation', async () => {
    expect(
      await resolve(['--realm', 'work', '--limit', '20', '--json']),
    ).toEqual({
      format: 'json',
      refs: false,
      input: { realms: ['work'], limit: 20 },
    })
    expect(
      await resolve([
        'quarterly',
        '--remote',
        '--source',
        'work-outlook',
        '--continuation',
        'opaque-next-page',
      ]),
    ).toMatchObject({
      input: {
        text: 'quarterly',
        sourceIds: ['work-outlook'],
        remote: true,
        continuation: 'opaque-next-page',
      },
    })
  })

  test('rejects semantic filter and pagination conflicts', async () => {
    for (const rawArgs of [
      [],
      ['x', '--field', 'sender=a'],
      ['x', '--remote', '--local-only'],
      ['x', '--continuation', 'next'],
      ['x', '--remote', '--continuation', 'next'],
      [
        'x',
        '--remote',
        '--source',
        'a',
        '--source',
        'b',
        '--continuation',
        'next',
      ],
      [
        'x',
        '--remote',
        '--source',
        'a',
        '--offset',
        '1',
        '--continuation',
        'next',
      ],
      ['x', '--offset', '5'],
    ]) {
      await expect(resolve(rawArgs)).rejects.toMatchObject({
        code: 'invalid_args',
      })
    }
  })

  test('rejects invalid dates and counts before execution', async () => {
    for (const rawArgs of [
      ['--realm', 'work', '--since', 'not-a-date'],
      ['--realm', 'work', '--limit', '-1'],
      ['--realm', 'work', '--offset', '1.5'],
      ['x', '--remote', '--source', 'a', '--continuation', '   '],
    ]) {
      await expect(resolve(rawArgs)).rejects.toMatchObject({
        code: 'invalid_args',
      })
    }
  })
})
