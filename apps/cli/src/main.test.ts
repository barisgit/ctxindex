import { afterEach, expect, spyOn, test } from 'bun:test'
import { rootCommand, runCli } from './main'

afterEach(() => {
  spyOn(console, 'log').mockRestore()
  spyOn(console, 'error').mockRestore()
})

test('keeps only Action execution under the action command', () => {
  expect(rootCommand.subCommands).toMatchObject({
    action: {
      subCommands: {
        run: expect.any(Object),
      },
    },
  })
  expect(rootCommand.subCommands).not.toHaveProperty('action.describe')
})

test('registers export as a root command', () => {
  expect(rootCommand.subCommands).toMatchObject({ export: expect.any(Object) })
})

test('registers OAuth App commands without a Client alias', () => {
  expect(rootCommand.subCommands).toMatchObject({
    'oauth-app': {
      subCommands: {
        add: expect.any(Object),
        list: expect.any(Object),
        remove: expect.any(Object),
      },
    },
  })
  expect(rootCommand.subCommands).not.toHaveProperty('client')
})

test('keeps cache removal with the other Artifact operations', () => {
  expect(rootCommand.subCommands).toMatchObject({
    artifact: { subCommands: { purge: expect.any(Object) } },
  })
  expect(rootCommand.subCommands).not.toHaveProperty('purge')
})

test('registers explicit foreground daemon lifecycle commands', () => {
  expect(rootCommand.subCommands).toMatchObject({
    daemon: {
      subCommands: {
        serve: expect.any(Object),
        health: expect.any(Object),
        shutdown: expect.any(Object),
      },
    },
  })
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
