import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'

function dbPath(sandbox: Sandbox): string {
  return join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite')
}

async function withInitializedSandbox(
  fn: (sandbox: Sandbox) => Promise<void>,
): Promise<void> {
  const sandbox = await createSandbox()
  try {
    const init = await sandbox.run(['init'])
    expect(init.stderr).toBe('')
    expect(init.exitCode).toBe(0)
    await fn(sandbox)
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

describe('source e2e', () => {
  test('source add local.directory exits 0', async () => {
    await withInitializedSandbox(async (sandbox) => {
      const root = join(sandbox.dir, 'source-root')
      await mkdir(root, { recursive: true })

      const result = await sandbox.run([
        'source',
        'add',
        '--adapter',
        'local.directory',
        '--realm',
        'global',
        '--root',
        root,
      ])

      expect(result.stderr).toBe('')
      expect(result.exitCode).toBe(0)
      const sourceId = parseSourceId(result.stdout)

      const db = new Database(dbPath(sandbox), { readonly: true })
      try {
        const row = db
          .prepare('SELECT adapter_id, config_json FROM sources WHERE id = ?')
          .get(sourceId) as { adapter_id: string; config_json: string } | null
        expect(row?.adapter_id).toBe('local.directory')
        expect(JSON.parse(row?.config_json ?? '{}')).toEqual({
          root_path: root,
        })
      } finally {
        db.close()
      }
    })
  })

  test('source add accepts local-directory as alias for local.directory', async () => {
    await withInitializedSandbox(async (sandbox) => {
      const dottedRoot = join(sandbox.dir, 'source-root-dotted')
      const dashedRoot = join(sandbox.dir, 'source-root-dashed')
      await mkdir(dottedRoot, { recursive: true })
      await mkdir(dashedRoot, { recursive: true })

      const dotted = await sandbox.run([
        'source',
        'add',
        'local.directory',
        '--realm',
        'global',
        '--root',
        dottedRoot,
      ])
      const dashed = await sandbox.run([
        'source',
        'add',
        'local-directory',
        '--realm',
        'global',
        '--root',
        dashedRoot,
      ])

      expect(dotted.stderr).toBe('')
      expect(dotted.exitCode).toBe(0)
      expect(dashed.stderr).toBe('')
      expect(dashed.exitCode).toBe(0)

      const db = new Database(dbPath(sandbox), { readonly: true })
      try {
        const rows = db
          .prepare(
            'SELECT adapter_id, config_json FROM sources ORDER BY created_at',
          )
          .all() as { adapter_id: string; config_json: string }[]
        expect(rows).toHaveLength(2)
        expect(rows.map((row) => row.adapter_id)).toEqual([
          'local.directory',
          'local.directory',
        ])
        expect(JSON.parse(rows[0]?.config_json ?? '{}')).toEqual({
          root_path: dottedRoot,
        })
        expect(JSON.parse(rows[1]?.config_json ?? '{}')).toEqual({
          root_path: dashedRoot,
        })
      } finally {
        db.close()
      }
    })
  })

  test('source list shows added source', async () => {
    await withInitializedSandbox(async (sandbox) => {
      const root = join(sandbox.dir, 'source-root')
      await mkdir(root, { recursive: true })
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
      const sourceId = parseSourceId(add.stdout)

      const list = await sandbox.run(['source', 'list'])

      expect(list.stderr).toBe('')
      expect(list.exitCode).toBe(0)
      expect(list.stdout).toContain(sourceId)
      expect(list.stdout).toContain('local.directory')
    })
  })

  test('no hang with stdin pipe', async () => {
    await withInitializedSandbox(async (sandbox) => {
      const root = join(sandbox.dir, 'source-root')
      await mkdir(root, { recursive: true })
      const startedAt = performance.now()
      const result = await Promise.race([
        sandbox.run(
          [
            'source',
            'add',
            '--adapter',
            'local.directory',
            '--realm',
            'global',
            '--root',
            root,
          ],
          {
            stdin: new Uint8Array(),
          },
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('source add hung')), 5000),
        ),
      ])
      const durationMs = performance.now() - startedAt

      expect(durationMs).toBeLessThan(4000)
      expect(result.exitCode).toBe(0)
    })
  })

  test('missing required flag exits 2', async () => {
    await withInitializedSandbox(async (sandbox) => {
      const root = join(sandbox.dir, 'source-root')
      await mkdir(root, { recursive: true })

      const result = await sandbox.run([
        'source',
        'add',
        '--realm',
        'global',
        '--root',
        root,
      ])

      expect(result.exitCode).toBe(2)
      expect(result.stderr).toContain('missing <adapter-id>')
    })
  })

  test('unknown adapter exits 2', async () => {
    await withInitializedSandbox(async (sandbox) => {
      const root = join(sandbox.dir, 'source-root')
      await mkdir(root, { recursive: true })

      const result = await sandbox.run([
        'source',
        'add',
        '--adapter',
        'foo.bar',
        '--root',
        root,
      ])

      expect(result.exitCode).toBe(2)
      expect(result.stderr).toContain('Unknown adapter')
      expect(result.stderr).toContain('foo.bar')
    })
  })
})
