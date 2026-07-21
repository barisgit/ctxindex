import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { runCommand } from 'citty'
import {
  defineCtxCommand,
  prepareCommandTree,
  renderCommandUsage,
} from '../command-model'
import { runCli } from '../main'
import { actionCommand, actionRunCommand } from './action'
import { artifactCommand } from './artifact'
import { describeCommand } from './describe'
import { threadCommand } from './thread'

afterEach(() => {
  process.exitCode = 0
  spyOn(console, 'error').mockRestore()
  spyOn(console, 'log').mockRestore()
})

describe('simplified Resource command grammar', () => {
  test('exposes only the accepted command hierarchy', () => {
    expect(threadCommand.subCommands).toBeUndefined()
    expect(actionCommand.subCommands).toEqual({
      run: expect.any(Object),
    })
    expect(artifactCommand.subCommands).toEqual({
      list: expect.any(Object),
      download: expect.any(Object),
      purge: expect.any(Object),
    })
  })

  test('renders the accepted typed arguments from the command definitions', async () => {
    const root = defineCtxCommand({
      meta: { name: 'ctxindex', description: 'Fixture CLI' },
      subCommands: {
        action: actionCommand,
        artifact: artifactCommand,
        describe: describeCommand,
        thread: threadCommand,
      },
    })
    await prepareCommandTree(root)

    expect(await renderCommandUsage(threadCommand)).toContain(
      'USAGE ctxindex thread [OPTIONS] <REF>',
    )
    expect(await renderCommandUsage(describeCommand)).toContain('--source')
    expect(actionRunCommand.args).toMatchObject({
      'action-id': { type: 'positional', required: true },
      source: { type: 'string', required: true },
      input: { type: 'string', required: true },
    })
  })

  test('rejects the removed thread get form before opening state', async () => {
    const error = spyOn(console, 'error').mockImplementation(() => {})
    const root = defineCtxCommand({
      meta: { name: 'ctxindex', description: 'Fixture CLI' },
      subCommands: { thread: threadCommand },
    })
    await prepareCommandTree(root)

    await runCommand(threadCommand, {
      rawArgs: ['get', 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/message/one'],
    })

    expect(process.exitCode).toBe(2)
    expect(error.mock.calls.flat().join(' ')).toContain(
      'ctxindex thread: unexpected argument',
    )
  })

  test.each([
    {
      args: ['thread', 'get', 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/message/one'],
    },
    { args: ['purge', 'artifacts'] },
    { args: ['action', 'describe', 'fake.note.create'] },
  ])('rejects removed root grammar with exit 2 and no initialized state: $args', async ({
    args,
  }) => {
    spyOn(console, 'error').mockImplementation(() => {})
    spyOn(console, 'log').mockImplementation(() => {})

    expect(await runCli([...args])).toBe(2)
  })
})
