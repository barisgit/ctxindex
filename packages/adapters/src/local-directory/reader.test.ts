import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readLocalFile } from './reader'
import { walkDirectory } from './walker'

async function entryFor(content: string | Uint8Array) {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-reader-'))
  const path = join(root, 'file.txt')
  await writeFile(path, content)
  const entry = (await walkDirectory(root)).entries[0]
  if (!entry) throw new Error('fixture file was not walked')
  return { root, path, entry }
}

describe('readLocalFile', () => {
  test('accepts plain source text and returns complete content metadata', async () => {
    const { entry } = await entryFor('const value = 1\n')
    const result = await readLocalFile(entry, 1024)
    expect(result).toMatchObject({
      status: 'success',
      mediaType: 'text/plain',
      byteSize: 16,
      text: 'const value = 1\n',
    })
    if (result.status === 'success') {
      expect(result.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/)
      expect(result.modifiedAt).toMatch(/^\d{4}-\d\d-\d\dT/)
    }
  })

  test('rejects magic binary, NUL bytes, and invalid UTF-8', async () => {
    const fixtures = [
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Uint8Array.from([0x61, 0x00, 0x62]),
      Uint8Array.from([0xc3, 0x28]),
    ]
    for (const bytes of fixtures) {
      const { entry } = await entryFor(bytes)
      const result = await readLocalFile(entry, 1024)
      expect(result).toMatchObject({
        status: 'warning',
        warning: { code: 'binary_skipped', path: 'file.txt' },
      })
    }
  })

  test('skips initial and unexpectedly grown oversize files', async () => {
    const initial = await entryFor('123456789')
    expect(await readLocalFile(initial.entry, 8)).toMatchObject({
      status: 'warning',
      warning: { code: 'oversize_skipped' },
    })

    const grown = await entryFor('tiny')
    await writeFile(grown.path, 'x'.repeat(1024 * 1024))
    expect(await readLocalFile(grown.entry, 8)).toMatchObject({
      status: 'warning',
      warning: { code: 'oversize_skipped' },
    })
  })

  test('does not follow a walked file replaced by an outward symlink', async () => {
    const walked = await entryFor('safe')
    const outside = await entryFor('outside secret')
    await rm(walked.path)
    await symlink(outside.path, walked.path)

    const result = await readLocalFile(walked.entry, 1024)

    expect(result).toMatchObject({
      status: 'warning',
      warning: { code: 'read_failed', path: 'file.txt' },
    })
    expect(JSON.stringify(result)).not.toContain('outside secret')
  })

  test('rejects same-size modification after walking as uncertain', async () => {
    const walked = await entryFor('aaaa')
    await writeFile(walked.path, 'bbbb')
    const changed = new Date('2030-01-01T00:00:00.000Z')
    await utimes(walked.path, changed, changed)

    expect(await readLocalFile(walked.entry, 1024)).toMatchObject({
      status: 'warning',
      warning: { code: 'read_failed', path: 'file.txt' },
    })
  })

  test('does not swallow cancellation', async () => {
    const { entry } = await entryFor('text')
    const controller = new AbortController()
    controller.abort(new Error('cancelled fixture'))
    await expect(readLocalFile(entry, 1024, controller.signal)).rejects.toThrow(
      'cancelled fixture',
    )
  })
})
