import { afterEach, expect, spyOn, test } from 'bun:test'
import { runCommand } from 'citty'
import { prepareCommandTree, projectCommandReference } from '../command-model'
import { extensionCommand } from '../extensions/command'

afterEach(() => {
  process.exitCode = 0
  spyOn(console, 'error').mockRestore()
})

test('declares the singular Extension command tree and uniform install grammar', async () => {
  const root = {
    meta: { name: 'ctxindex' },
    subCommands: { extension: extensionCommand },
  }
  const projection = await projectCommandReference(root)
  const commands = new Map(
    projection.commands.map((command) => [command.path.join(' '), command]),
  )

  expect([...commands.keys()]).toEqual(
    expect.arrayContaining([
      'ctxindex extension',
      'ctxindex extension list',
      'ctxindex extension catalog build',
      'ctxindex extension catalog add',
      'ctxindex extension catalog list',
      'ctxindex extension catalog show',
      'ctxindex extension catalog search',
      'ctxindex extension catalog refresh',
      'ctxindex extension catalog remove',
      'ctxindex extension install',
      'ctxindex extension update',
      'ctxindex extension uninstall',
    ]),
  )
  expect(commands.has('ctxindex extension search')).toBe(false)

  const install = commands.get('ctxindex extension install')
  expect(install?.usage).toContain('SOURCE-KIND=<catalog|npm|git|local>')
  expect(install?.arguments).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'source-kind',
        required: true,
        choices: ['catalog', 'npm', 'git', 'local'],
      }),
      expect.objectContaining({ name: 'target', required: true }),
      expect.objectContaining({ name: 'extension-id', required: true }),
      expect.objectContaining({ name: 'refresh', required: false }),
      expect.objectContaining({ name: 'json', required: false }),
    ]),
  )
  expect(install?.arguments.map(({ name }) => name)).not.toContain('trust')
  expect(
    commands
      .get('ctxindex extension update')
      ?.arguments.map(({ name }) => name),
  ).not.toContain('trust')
  expect(
    commands
      .get('ctxindex extension catalog add')
      ?.arguments.map(({ name }) => name),
  ).toContain('trust')
  expect(
    commands
      .get('ctxindex extension catalog build')
      ?.arguments.map(({ name }) => name),
  ).toContain('trust')
})

test('rejects an invalid install source kind from the command definition before effects', async () => {
  const root = {
    meta: { name: 'ctxindex' },
    subCommands: { extension: extensionCommand },
  }
  await prepareCommandTree(root)
  const subCommands = await Promise.resolve(
    typeof extensionCommand.subCommands === 'function'
      ? extensionCommand.subCommands()
      : extensionCommand.subCommands,
  )
  const installValue = subCommands?.install
  const install = await Promise.resolve(
    typeof installValue === 'function' ? installValue() : installValue,
  )
  if (install === undefined) throw new Error('install command is missing')
  const error = spyOn(console, 'error').mockImplementation(() => {})

  await runCommand(install, {
    rawArgs: ['fixture', 'fixture.target', 'fixture.extension'],
  })

  expect(process.exitCode).toBe(2)
  expect(error.mock.calls.flat().join(' ')).toContain('source-kind')
})
