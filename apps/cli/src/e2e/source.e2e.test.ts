import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'

function dbPath(sandbox: Sandbox): string {
  return join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite')
}

function insertGoogleGrant(
  sandbox: Sandbox,
  input: { id: string; email: string; scopes: string },
): void {
  const db = new Database(dbPath(sandbox))
  try {
    const now = Date.now()
    const accountId = `account-${input.id}`
    db.prepare(
      `INSERT INTO accounts
         (id, provider, label, external_user_id, created_at, updated_at)
       VALUES (?, 'google', ?, ?, ?, ?)`,
    ).run(accountId, input.email, input.email, now, now)
    db.prepare(
      `INSERT INTO grants
         (id, account_id, provider, scopes_json, app_config_ref, created_at, updated_at)
       VALUES (?, ?, 'google', ?, 'secret://test/app', ?, ?)`,
    ).run(input.id, accountId, input.scopes, now, now)
  } finally {
    db.close()
  }
}

async function withInitializedSandbox(
  fn: (sandbox: Sandbox) => Promise<void>,
): Promise<void> {
  const sandbox = await createSandbox()
  try {
    const init = await sandbox.run(['init'])
    expect(init.stderr).toBe('')
    expect(init.exitCode).toBe(0)
    const realm = await sandbox.run(['realm', 'add', 'global'])
    expect(realm.stderr).toBe('')
    expect(realm.exitCode).toBe(0)
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
  test('OAuth App collision keeps the rejected Extension Adapter unavailable', async () => {
    const sandbox = await createSandbox()
    try {
      expect((await sandbox.run(['init'])).exitCode).toBe(0)
      expect((await sandbox.run(['realm', 'add', 'global'])).exitCode).toBe(0)
      const app = await sandbox.run(
        ['oauth-app', 'add', 'google', 'shadowed', '--from-env'],
        { env: { CTXINDEX_GOOGLE_CLIENT_ID: 'local-client-id' } },
      )
      expect(app.exitCode, app.stderr).toBe(0)

      const packageRoot = join(sandbox.dir, 'shadowing-extension')
      await mkdir(packageRoot, { recursive: true })
      await writeFile(
        join(packageRoot, 'package.json'),
        JSON.stringify({
          name: '@ctxindex/shadowing-fixture',
          ctxindex: { extensions: ['./entry.ts'] },
        }),
      )
      const repoRoot = resolve(import.meta.dir, '../../../..')
      await writeFile(
        join(packageRoot, 'entry.ts'),
        `import { defineAdapter, defineExtension, defineOAuthApp, z } from ${JSON.stringify(join(repoRoot, 'packages/extension-sdk/src/index.ts'))}
import { googleOAuthProvider } from ${JSON.stringify(join(repoRoot, 'packages/adapters/src/google-oauth-provider.ts'))}

const shadowedApp = defineOAuthApp(googleOAuthProvider, {
  label: 'shadowed',
  config: { clientId: 'extension-client-id' },
})
const rejectedAdapter = defineAdapter({
  id: 'fixture.shadowed',
  configSchema: z.object({}).strict(),
  profiles: [],
  routing: 'indexed',
  capabilities: [],
  operations: {},
  actions: {},
})
export default defineExtension({
  id: 'fixture.shadowing-extension',
  oauthApps: [shadowedApp],
  adapters: [rejectedAdapter],
})
`,
      )
      await writeFile(
        join(sandbox.env.CTXINDEX_CONFIG_HOME, 'config.toml'),
        `[extensions]\npaths = ${JSON.stringify([packageRoot])}\n\n[secrets]\nbackend = "keychain"\n\n[log]\nlevel = "info"\n\n[log.file]\nrotate = "daily"\nretain_days = 14\ncompress = true\n`,
      )

      const result = await sandbox.run([
        'source',
        'add',
        'fixture.shadowed',
        '--realm',
        'global',
      ])

      expect(result.exitCode).toBe(2)
      expect(result.stderr).toContain(
        'source add: unknown adapter id "fixture.shadowed"',
      )
    } finally {
      await sandbox.cleanup()
    }
  })

  test.each([
    ['--config-raw-records-enabled', 'true'],
    ['--config-labels-include', 'INBOX'],
    ['--config-labels-exclude', 'SPAM'],
    ['--config-sync-window-days', '30'],
  ])('source add Gmail rejects former option %s before opening state', async (flag, value) => {
    const sandbox = await createSandbox()
    try {
      const result = await sandbox.run([
        'source',
        'add',
        'google.mailbox',
        '--realm',
        'work',
        flag,
        value,
      ])

      expect(result.exitCode).toBe(2)
      expect(result.stderr).toContain(`unknown option ${flag}`)
      expect(await Bun.file(dbPath(sandbox)).exists()).toBe(false)
    } finally {
      await sandbox.cleanup()
    }
  })

  test('invalid --no-sync forms fail before persistent state is opened', async () => {
    const sandbox = await createSandbox()
    try {
      for (const suffix of [
        ['--no-sync=false'],
        ['--no-sync', '--no-sync'],
        ['--no-sync', 'false'],
        ['--no_sync'],
      ]) {
        const result = await sandbox.run([
          'source',
          'add',
          'local.directory',
          '--realm',
          'work',
          '--config-root-path',
          '/tmp',
          ...suffix,
        ])
        expect(result.exitCode, suffix.join(' ')).toBe(2)
      }
      await expect(access(dbPath(sandbox))).rejects.toThrow()
    } finally {
      await sandbox.cleanup()
    }
  })

  test('source add Gmail rejects token-bearing config', async () => {
    await withInitializedSandbox(async (sandbox) => {
      const result = await sandbox.run([
        'source',
        'add',
        'google.mailbox',
        '--realm',
        'global',
        '--config-json',
        '{"access_token":"malicious-token"}',
      ])

      expect(result.exitCode).toBe(2)
      expect(result.stderr).toContain('invalid config')
      expect(result.stderr).not.toContain('malicious-token')
    })
  })

  test('source add Gmail rejects incompatible and ambiguous Account authorizations', async () => {
    await withInitializedSandbox(async (sandbox) => {
      insertGoogleGrant(sandbox, {
        id: 'grant-incompatible',
        email: 'wrong@example.com',
        scopes: 'profile',
      })
      const incompatible = await sandbox.run([
        'source',
        'add',
        'google.mailbox',
        '--realm',
        'global',
      ])
      expect(incompatible.exitCode).toBe(2)
      expect(incompatible.stderr).toContain('compatible Account authorization')

      const gmailScopes = JSON.stringify([
        'https://www.googleapis.com/auth/gmail.compose',
        'https://www.googleapis.com/auth/gmail.readonly',
      ])
      insertGoogleGrant(sandbox, {
        id: 'grant-a',
        email: 'a@example.com',
        scopes: gmailScopes,
      })
      insertGoogleGrant(sandbox, {
        id: 'grant-b',
        email: 'b@example.com',
        scopes: JSON.stringify([...JSON.parse(gmailScopes), 'profile']),
      })
      const ambiguous = await sandbox.run([
        'source',
        'add',
        'google.mailbox',
        '--realm',
        'global',
      ])
      expect(ambiguous.exitCode).toBe(2)
      expect(ambiguous.stderr).toContain('multiple compatible Accounts')
      expect(ambiguous.stderr).not.toMatch(/grant/i)
    })
  })

  test('source add Gmail accepts Account id but rejects private Grant id', async () => {
    await withInitializedSandbox(async (sandbox) => {
      const gmailScopes = JSON.stringify([
        'https://www.googleapis.com/auth/gmail.compose',
        'https://www.googleapis.com/auth/gmail.readonly',
      ])
      insertGoogleGrant(sandbox, {
        id: 'grant-a',
        email: 'a@example.com',
        scopes: gmailScopes,
      })
      insertGoogleGrant(sandbox, {
        id: 'grant-b',
        email: 'b@example.com',
        scopes: gmailScopes,
      })

      const privateSelector = await sandbox.run([
        'source',
        'add',
        'google.mailbox',
        '--realm',
        'global',
        '--account',
        'grant-b',
      ])
      expect(privateSelector.exitCode).toBe(2)
      expect(privateSelector.stderr).not.toContain('Grant')

      const result = await sandbox.run([
        'source',
        'add',
        'google.mailbox',
        '--realm',
        'global',
        '--account',
        'account-grant-b',
      ])
      expect(result.stderr).toBe('')
      expect(result.exitCode).toBe(0)
      const sourceId = parseSourceId(result.stdout)

      const db = new Database(dbPath(sandbox), { readonly: true })
      try {
        expect(
          db.prepare('SELECT grant_id FROM sources WHERE id = ?').get(sourceId),
        ).toEqual({ grant_id: 'grant-b' })
      } finally {
        db.close()
      }
    })
  })

  test('source add local.directory exits 0', async () => {
    await withInitializedSandbox(async (sandbox) => {
      const root = join(sandbox.dir, 'source-root')
      await mkdir(root, { recursive: true })

      const result = await sandbox.run([
        'source',
        'add',
        'local.directory',
        '--realm',
        'global',
        '--config-root-path',
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

  test('source add --no-sync forwards and persists the disabled policy', async () => {
    await withInitializedSandbox(async (sandbox) => {
      const root = join(sandbox.dir, 'disabled-source-root')
      await mkdir(root, { recursive: true })

      const result = await sandbox.run([
        'source',
        'add',
        'local.directory',
        '--realm',
        'global',
        '--config-root-path',
        root,
        '--no-sync',
      ])

      expect(result.stderr).toBe('')
      expect(result.exitCode).toBe(0)
      const sourceId = parseSourceId(result.stdout)
      const db = new Database(dbPath(sandbox), { readonly: true })
      try {
        expect(
          db
            .prepare('SELECT sync_enabled FROM sources WHERE id = ?')
            .get(sourceId),
        ).toEqual({ sync_enabled: 0 })
      } finally {
        db.close()
      }
      const list = await sandbox.run(['source', 'list', '--json'])
      expect(list.exitCode).toBe(0)
      expect(JSON.parse(list.stdout)).toMatchObject([
        { id: sourceId, syncEnabled: false },
      ])

      const allSync = await sandbox.run(['sync', '--json'])
      expect(allSync.exitCode).toBe(0)
      expect(JSON.parse(allSync.stdout)).toMatchObject({ results: [] })

      const targetedSync = await sandbox.run(['sync', '--source', sourceId])
      expect(targetedSync.exitCode).toBe(2)
      expect(targetedSync.stderr).toContain('not sync-enabled')

      const verificationDb = new Database(dbPath(sandbox), { readonly: true })
      try {
        expect(
          verificationDb
            .prepare('SELECT count(*) AS count FROM sync_runs')
            .get(),
        ).toEqual({ count: 0 })
      } finally {
        verificationDb.close()
      }
    })
  })

  test('source list shows added source', async () => {
    await withInitializedSandbox(async (sandbox) => {
      const root = join(sandbox.dir, 'source-root')
      await mkdir(root, { recursive: true })
      await writeFile(join(root, 'note.txt'), 'source list counts needle')
      const add = await sandbox.run([
        'source',
        'add',
        'local.directory',
        '--realm',
        'global',
        '--label',
        'repo-under-test',
        '--config-root-path',
        root,
      ])
      const sourceId = parseSourceId(add.stdout)
      const sync = await sandbox.run(['sync'])
      expect(sync.exitCode).toBe(0)

      const list = await sandbox.run(['source', 'list'])

      expect(list.stderr).toBe('')
      expect(list.exitCode).toBe(0)
      expect(list.stdout).toContain('Source')
      expect(list.stdout).toContain('Adapter')
      expect(list.stdout).toContain('Realm')
      expect(list.stdout).toContain(sourceId)
      expect(list.stdout).toContain('repo-under-test')
      expect(list.stdout).toContain('local.directory')
      // Ref path is asserted exactly via --json below; the table cell may
      // wrap long paths mid-word, so no substring assertion on the table.

      const json = await sandbox.run(['source', 'list', '--json'])
      expect(json.stderr).toBe('')
      expect(json.exitCode).toBe(0)
      const rows = JSON.parse(json.stdout) as Array<{
        label: string
        realmSlug: string
        ref: string
        availability: string
        itemsCount: number
        syncEnabled: boolean
      }>
      expect(rows[0]).toMatchObject({
        label: 'repo-under-test',
        realmSlug: 'global',
        ref: root,
        availability: 'available',
        itemsCount: 1,
        syncEnabled: true,
      })

      const compact = await sandbox.run([
        'source',
        'list',
        '--format',
        'compact',
      ])
      expect(compact.stderr).toBe('')
      expect(compact.exitCode).toBe(0)
      expect(compact.stdout).toContain(sourceId)
      expect(compact.stdout).toContain('label=repo-under-test')
      expect(compact.stdout).toContain('adapter=local.directory')
      expect(compact.stdout).toContain('items=1')
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
            'local.directory',
            '--realm',
            'global',
            '--config-root-path',
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
        '--config-root-path',
        root,
      ])

      expect(result.exitCode).toBe(2)
      expect(result.stderr).toContain('missing <adapter-id>')
    })
  })

  test('source remove purges synced data and exits 0', async () => {
    await withInitializedSandbox(async (sandbox) => {
      const root = join(sandbox.dir, 'remove-root')
      await mkdir(root, { recursive: true })
      await writeFile(join(root, 'a.txt'), 'hello widgets and gadgets\n')
      await writeFile(join(root, 'b.md'), '# notes\nmore widget content here\n')

      const add = await sandbox.run([
        'source',
        'add',
        'local.directory',
        '--realm',
        'global',
        '--config-root-path',
        root,
      ])
      const sourceId = parseSourceId(add.stdout)

      const sync = await sandbox.run(['sync'])
      expect(sync.exitCode).toBe(0)

      const remove = await sandbox.run(['source', 'remove', sourceId])
      expect(remove.stderr).toBe('')
      expect(remove.exitCode).toBe(0)

      const db = new Database(dbPath(sandbox), { readonly: true })
      try {
        const total = (table: string): number =>
          (
            db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as {
              c: number
            }
          ).c
        // Single-source sandbox: removing the source purges its generic
        // Resource projections and Sync bookkeeping.
        for (const table of [
          'sources',
          'resources',
          'chunks',
          'field_index',
          'relations',
          'sync_runs',
          'source_sync_state',
        ]) {
          expect(total(table), `${table} should be empty after remove`).toBe(0)
        }
      } finally {
        db.close()
      }

      const list = await sandbox.run(['source', 'list'])
      expect(list.exitCode).toBe(0)
      expect(list.stdout).not.toContain(sourceId)
    })
  })

  test('unknown adapter exits 2', async () => {
    await withInitializedSandbox(async (sandbox) => {
      const result = await sandbox.run([
        'source',
        'add',
        'foo.bar',
        '--realm',
        'global',
      ])

      expect(result.exitCode).toBe(2)
      expect(result.stderr).toContain('unknown adapter id "foo.bar"')
      expect(result.stderr).toContain('foo.bar')
    })
  })
})
