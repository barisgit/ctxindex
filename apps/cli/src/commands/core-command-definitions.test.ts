import { afterEach, expect, spyOn, test } from 'bun:test'
import { runCommand } from 'citty'
import {
  defineCtxCommand,
  prepareCommandTree,
  projectCommandReference,
} from '../command-model'
import { daemonCommand } from '../daemon/command'
import { accountCommand } from './account'
import { artifactCommand } from './artifact'
import { describeCommand } from './describe'
import { exportCommand } from './export'
import { getCommand } from './get'
import { initCommand } from './init'
import { oauthAppCommand } from './oauth-app'
import { realmCommand } from './realm'
import { secretsCommand } from './secrets'
import { skillsCommand } from './skills'
import { statusCommand } from './status'
import { syncCommand } from './sync'
import { threadCommand } from './thread'

afterEach(() => {
  process.exitCode = 0
  spyOn(console, 'error').mockRestore()
})

function commandTree() {
  return defineCtxCommand({
    meta: { name: 'ctxindex' },
    subCommands: {
      account: accountCommand,
      artifact: artifactCommand,
      daemon: daemonCommand,
      describe: describeCommand,
      export: exportCommand,
      get: getCommand,
      init: initCommand,
      'oauth-app': oauthAppCommand,
      realm: realmCommand,
      secrets: secretsCommand,
      skills: skillsCommand,
      status: statusCommand,
      sync: syncCommand,
      thread: threadCommand,
    },
  })
}

test('core command definitions own required arguments and bounded choices', async () => {
  const projection = await projectCommandReference(commandTree())
  const commands = new Map(
    projection.commands.map((command) => [command.path.join(' '), command]),
  )

  expect(commands.get('ctxindex account add')?.arguments).toContainEqual(
    expect.objectContaining({ name: 'provider', required: true }),
  )
  expect(commands.get('ctxindex export')?.arguments).toContainEqual(
    expect.objectContaining({ name: 'format', required: true }),
  )
  expect(commands.get('ctxindex describe')?.arguments).toContainEqual(
    expect.objectContaining({
      name: 'selector',
      required: false,
      choices: ['profile', 'adapter', 'action'],
    }),
  )
  expect(
    commands.get('ctxindex secrets backend set')?.arguments,
  ).toContainEqual(
    expect.objectContaining({
      name: 'target',
      required: true,
      choices: ['keychain', 'file'],
    }),
  )
  expect(commands.get('ctxindex status')?.arguments).toContainEqual(
    expect.objectContaining({
      name: 'format',
      type: 'enum',
      choices: ['pretty', 'text', 'json'],
      required: false,
    }),
  )
  for (const path of ['ctxindex artifact list', 'ctxindex thread']) {
    expect(commands.get(path)?.arguments).toContainEqual(
      expect.objectContaining({
        name: 'format',
        type: 'enum',
        choices: ['pretty', 'text', 'json'],
        required: false,
      }),
    )
  }
  expect(commands.get('ctxindex sync')?.arguments).toContainEqual(
    expect.objectContaining({
      name: 'mode',
      type: 'enum',
      choices: ['sync', 'resync', 'diff'],
      defaultValue: 'sync',
    }),
  )
  expect([...commands.keys()]).toEqual(
    expect.arrayContaining([
      'ctxindex daemon health',
      'ctxindex get',
      'ctxindex init',
      'ctxindex oauth-app add',
      'ctxindex realm add',
      'ctxindex secrets backend set',
      'ctxindex skills get',
    ]),
  )
})

test('generated help describes exact nested grammar', async () => {
  const projection = await projectCommandReference(commandTree())
  const commands = new Map(
    projection.commands.map((command) => [command.path.join(' '), command]),
  )
  const oauthAdd = commands.get('ctxindex oauth-app add')
  const secretsSet = commands.get('ctxindex secrets backend set')
  if (!oauthAdd || !secretsSet) throw new Error('fixture command missing')

  expect(oauthAdd.usage).toContain(
    'ctxindex oauth-app add [OPTIONS] <PROVIDER> <LABEL>',
  )
  expect(oauthAdd.usage).toContain('--from-env')
  expect(secretsSet.usage).toContain(
    'ctxindex secrets backend set [OPTIONS] <TARGET>',
  )
  expect(secretsSet.usage).toContain('TARGET=<keychain|file>')
  expect(commands.get('ctxindex describe')?.usage).toContain(
    'SELECTOR=<profile|adapter|action>',
  )
})

test('invalid describe selector stops before the assigned command handler', async () => {
  const error = spyOn(console, 'error').mockImplementation(() => {})
  await prepareCommandTree(commandTree())

  await runCommand(describeCommand, { rawArgs: ['fixture'] })

  expect(process.exitCode).toBe(2)
  expect(error.mock.calls.flat().join(' ')).toContain('selector')
})

test('invalid secret backend stops before the assigned command handler', async () => {
  const error = spyOn(console, 'error').mockImplementation(() => {})
  await prepareCommandTree(commandTree())

  await runCommand(secretsCommand, {
    rawArgs: ['backend', 'set', 'fixture'],
  })

  expect(process.exitCode).toBe(2)
  expect(error.mock.calls.flat().join(' ')).toContain('target')
})

test('invalid tokens stop before an assigned command handler runs', async () => {
  const error = spyOn(console, 'error').mockImplementation(() => {})
  const root = commandTree()
  await prepareCommandTree(root)

  await runCommand(syncCommand, { rawArgs: ['--unknown'] })

  expect(process.exitCode).toBe(2)
  expect(String(error.mock.calls[0]?.[0])).toContain(
    'ctxindex sync: unknown option --unknown',
  )
})
