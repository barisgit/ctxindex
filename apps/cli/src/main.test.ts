import { afterEach, expect, spyOn, test } from 'bun:test'
import { runCli } from './main'

afterEach(() => {
  spyOn(console, 'log').mockRestore()
})

test('prints help successfully', async () => {
  const log = spyOn(console, 'log').mockImplementation(() => {})

  expect(await runCli(['--help'])).toBe(0)
  expect(log).toHaveBeenCalled()
})
