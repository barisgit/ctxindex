import { afterEach, expect, spyOn, test } from 'bun:test'
import {
  FileLeaseUnsupportedError,
  UnsafeFileLeaseError,
} from '@ctxindex/local-daemon'
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

test('foreground startup renders unsupported lease hosts safely', async () => {
  const output = spyOn(console, 'error').mockImplementation(() => {})
  const start = (async () => {
    throw new FileLeaseUnsupportedError(
      'platform',
      'unsafe host detail /Users/person/private',
    )
  }) as typeof startDaemon

  expect(await runForegroundMain(start)).toBe(50)
  expect(output).toHaveBeenCalledWith(
    'The local daemon is unsupported on this platform or filesystem.',
  )
  expect(String(output.mock.calls[0]?.[0])).not.toContain('/Users/person')
})

test('foreground startup renders unsafe lease files as a bounded actionable failure', async () => {
  const output = spyOn(console, 'error').mockImplementation(() => {})
  const start = (async () => {
    throw new UnsafeFileLeaseError('Lease file must use private mode 0600')
  }) as typeof startDaemon

  expect(await runForegroundMain(start)).toBe(50)
  expect(output).toHaveBeenCalledWith(
    'The local daemon refused an unsafe retained lease: Lease file must use private mode 0600',
  )
  expect(String(output.mock.calls[0]?.[0])).not.toContain('stack')
})
