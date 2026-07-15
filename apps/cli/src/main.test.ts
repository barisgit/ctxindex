import { afterEach, expect, spyOn, test } from 'bun:test'
import { rootCommand, runCli } from './main'

afterEach(() => {
  spyOn(console, 'log').mockRestore()
})

test('registers export as a root command', () => {
  expect(rootCommand.subCommands).toMatchObject({ export: expect.any(Object) })
})

test('registers purge as a root command with artifacts nested beneath it', () => {
  expect(rootCommand.subCommands).toMatchObject({
    purge: { subCommands: { artifacts: expect.any(Object) } },
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
