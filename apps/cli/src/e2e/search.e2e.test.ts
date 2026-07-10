import { describe, expect, test } from 'bun:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'

async function withSearchFixture(
  fn: (sandbox: Sandbox, sourceId: string) => Promise<void>,
): Promise<void> {
  const sandbox = await createSandbox()
  try {
    const init = await sandbox.run(['init'])
    expect(init.stderr).toBe('')
    expect(init.exitCode).toBe(0)

    const root = join(sandbox.dir, 'fixture')
    await mkdir(root, { recursive: true })
    await writeFile(join(root, 'apple.txt'), 'apple banana\n')
    await writeFile(join(root, 'cherry.txt'), 'cherry date\n')

    const add = await sandbox.run([
      'source',
      'add',
      '--adapter',
      'local.directory',
      '--realm',
      'global',
      '--root',
      root,
    ])
    expect(add.stderr).toBe('')
    expect(add.exitCode).toBe(0)
    const sourceId = parseSourceId(add.stdout)

    const sync = await sandbox.run(['sync'])
    expect(sync.stderr).toBe('')
    expect(sync.exitCode).toBe(0)

    await fn(sandbox, sourceId)
  } finally {
    await sandbox.cleanup()
  }
}

function parseSourceId(stdout: string): string {
  const match = stdout.match(/source added: (\S+)/)
  expect(match).not.toBeNull()
  const id = match?.[1]
  expect(id).toBeDefined()
  return id as string
}

function parseJsonArray(stdout: string): unknown[] {
  const parsed = JSON.parse(stdout) as unknown
  expect(Array.isArray(parsed)).toBe(true)
  return parsed as unknown[]
}

describe('search e2e', () => {
  test('returns ranked results', async () => {
    await withSearchFixture(async (sandbox) => {
      const result = await sandbox.run(['search', 'apple'])

      expect(result.stderr).toBe('')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('apple.txt')
    })
  })

  test('json output parses', async () => {
    await withSearchFixture(async (sandbox) => {
      const result = await sandbox.run(['search', 'apple', '--json'])

      expect(result.stderr).toBe('')
      expect(result.exitCode).toBe(0)
      const rows = parseJsonArray(result.stdout)
      expect(rows.length).toBeGreaterThan(0)
    })
  })

  test('adapter-neutral refs format returns item references only', async () => {
    await withSearchFixture(async (sandbox) => {
      const result = await sandbox.run([
        'search',
        'apple',
        '--format',
        'refs',
        '--limit',
        '1',
      ])

      expect(result.stderr).toBe('')
      expect(result.exitCode).toBe(0)
      expect(result.stdout.trim()).toMatch(/^file:\/\/.*apple\.txt$/)
      expect(result.stdout.trim()).not.toContain('\t')
    })
  })

  test('compact/context formats expose refs and larger snippets for agents', async () => {
    await withSearchFixture(async (sandbox) => {
      const compact = await sandbox.run([
        'search',
        'apple',
        '--format',
        'compact',
        '--snippet-chars',
        '400',
      ])
      expect(compact.stderr).toBe('')
      expect(compact.exitCode).toBe(0)
      expect(compact.stdout).toContain('file://')
      expect(compact.stdout).toContain('apple banana')

      const context = await sandbox.run([
        'search',
        'apple',
        '--format',
        'context',
        '--limit',
        '1',
      ])
      expect(context.stderr).toBe('')
      expect(context.exitCode).toBe(0)
      expect(context.stdout).toContain('ref: file://')
      expect(context.stdout).toContain('kind: file')
      expect(context.stdout).toContain('snippet: apple banana')
    })
  })

  test('formatted json uses adapter-neutral agent fields', async () => {
    await withSearchFixture(async (sandbox) => {
      const result = await sandbox.run([
        'search',
        'apple',
        '--format',
        'compact',
        '--json',
      ])

      expect(result.stderr).toBe('')
      expect(result.exitCode).toBe(0)
      const rows = JSON.parse(result.stdout) as Array<{
        ref: string
        kind: string
        source: { adapterId: string }
        metadata: { path?: string; extension?: string }
        snippets: string[]
      }>
      expect(rows[0]?.ref).toMatch(/^file:\/\//)
      expect(rows[0]?.kind).toBe('file')
      expect(rows[0]?.source.adapterId).toBe('local.directory')
      expect(rows[0]?.metadata.extension).toBe('txt')
      expect(rows[0]?.snippets[0]).toContain('apple banana')
    })
  })

  test('all filter flags accepted', async () => {
    await withSearchFixture(async (sandbox, sourceId) => {
      const result = await sandbox.run([
        'search',
        'apple',
        '--realm',
        'global',
        '--source',
        sourceId,
        '--adapter',
        'local.directory',
        '--kind',
        'file',
        '--since',
        '1970-01-01',
        '--until',
        '2100-01-01',
        '--limit',
        '5',
        '--include-deleted',
        '--explain',
        '--json',
      ])

      expect(result.stderr).toBe('')
      expect(result.exitCode).toBe(0)
      const rows = parseJsonArray(result.stdout)
      expect(rows.length).toBeGreaterThan(0)
    })
  })

  test('since future date returns empty', async () => {
    await withSearchFixture(async (sandbox) => {
      const result = await sandbox.run([
        'search',
        'apple',
        '--since',
        '2099-01-01',
        '--json',
      ])

      expect(result.stderr).toBe('')
      expect(result.exitCode).toBe(0)
      expect(parseJsonArray(result.stdout)).toHaveLength(0)
    })
  })

  test('explain field present when requested', async () => {
    await withSearchFixture(async (sandbox) => {
      const result = await sandbox.run([
        'search',
        'apple',
        '--explain',
        '--json',
      ])

      expect(result.stderr).toBe('')
      expect(result.exitCode).toBe(0)
      const rows = parseJsonArray(result.stdout) as Array<{
        explain?: unknown
      }>
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) {
        expect(row.explain).toBeDefined()
      }
    })
  })

  test('invalid date exits 2', async () => {
    await withSearchFixture(async (sandbox) => {
      const result = await sandbox.run([
        'search',
        'apple',
        '--since',
        'notadate',
      ])

      expect(result.exitCode).toBe(2)
      expect(result.stderr).toContain('invalid --since date')
    })
  })
})
