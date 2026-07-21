import { afterEach, expect, spyOn, test } from 'bun:test'
import type { CommandDef } from 'citty'
import { rootCommand, runCli } from './main'

const rootSubCommands = rootCommand.subCommands as Record<string, CommandDef>

afterEach(() => {
  spyOn(console, 'log').mockRestore()
  spyOn(console, 'error').mockRestore()
})

test('keeps only Action execution under the action command', () => {
  expect(rootSubCommands.action).toBeDefined()
  expect(rootSubCommands.action?.subCommands).toHaveProperty('run')
  expect(Object.keys(rootSubCommands.action?.subCommands ?? {})).toEqual([
    'run',
  ])
  expect(rootCommand.subCommands).not.toHaveProperty('action.describe')
})

test('registers export as a root command', () => {
  expect(rootSubCommands.export).toBeDefined()
})

test('registers OAuth App commands without a Client alias', () => {
  expect(rootSubCommands['oauth-app']).toBeDefined()
  expect(Object.keys(rootSubCommands['oauth-app']?.subCommands ?? {})).toEqual([
    'add',
    'list',
    'remove',
  ])
  expect(rootCommand.subCommands).not.toHaveProperty('client')
})

test('keeps cache removal with the other Artifact operations', () => {
  expect(rootSubCommands.artifact).toBeDefined()
  expect(rootSubCommands.artifact?.subCommands).toHaveProperty('purge')
  expect(rootCommand.subCommands).not.toHaveProperty('purge')
})

test('registers explicit foreground daemon lifecycle commands', () => {
  expect(rootSubCommands.daemon).toBeDefined()
  expect(Object.keys(rootSubCommands.daemon?.subCommands ?? {})).toEqual([
    'serve',
    'health',
    'shutdown',
  ])
})

test('prints help successfully', async () => {
  const log = spyOn(console, 'log').mockImplementation(() => {})

  expect(await runCli(['--help'])).toBe(0)
  expect(log).toHaveBeenCalled()
})

test('prints export help successfully', async () => {
  const log = spyOn(console, 'log').mockImplementation(() => {})

  expect(await runCli(['export', '--help'])).toBe(0)
  expect(log).toHaveBeenCalled()
})

for (const args of [
  ['get'],
  ['oauth-app', 'add', 'google', 'work'],
  ['definitely-not-a-command'],
] as const) {
  test(`maps Citty usage failures to stable exit 2: ${args.join(' ')}`, async () => {
    spyOn(console, 'log').mockImplementation(() => {})
    spyOn(console, 'error').mockImplementation(() => {})

    expect(await runCli([...args])).toBe(2)
  })
}

test('rejects --json with --format before initialization or command effects', async () => {
  const error = spyOn(console, 'error').mockImplementation(() => {})

  expect(
    await runCli([
      'get',
      'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/item/one',
      '--json',
      '--format',
      'json',
    ]),
  ).toBe(2)
  expect(error).toHaveBeenCalledWith('cannot combine --json with --format')
})
