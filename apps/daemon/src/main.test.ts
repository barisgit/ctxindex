import { afterEach, expect, spyOn, test } from 'bun:test'
import { runForegroundMain } from './main'
import type { startDaemon } from './runtime'

afterEach(() => {
  spyOn(console, 'error').mockRestore()
})

test('foreground startup renders a safe database conflict and exits 50', async () => {
  const databaseDigest = 'a'.repeat(64)
  const rawPath = '/Users/person/private/ctxindex.sqlite.owner.lock'
  const output = spyOn(console, 'error').mockImplementation(() => {})
  const start = (async () => {
    throw {
      kind: 'database_lease_conflict',
      code: 'database_lease_conflict',
      message: 'The database is held by another local process/runtime.',
      databaseDigest,
      stack: `FileLeaseConflictError at ${rawPath}`,
    }
  }) as typeof startDaemon

  expect(await runForegroundMain(start)).toBe(50)
  const rendered = String(output.mock.calls[0]?.[0])
  expect(rendered).toContain(`database=${databaseDigest}`)
  expect(rendered).toContain('another local process/runtime')
  expect(rendered).not.toContain('owner=')
  expect(rendered).not.toContain(rawPath)
  expect(rendered).not.toContain('FileLeaseConflictError')
  expect(rendered).not.toContain('stack')
})
