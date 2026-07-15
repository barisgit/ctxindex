import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { handleSyncCommand } from './sync'

const error = spyOn(console, 'error').mockImplementation(() => {})

afterEach(() => {
  error.mockClear()
})

describe('deferred sync command', () => {
  test('sync fails actionably without opening stale runtime dependencies', async () => {
    await expect(handleSyncCommand([])).resolves.toBe(2)
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('adapter-to-Resource orchestration'),
    )
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('ctxindex source list'),
    )
  })
})
