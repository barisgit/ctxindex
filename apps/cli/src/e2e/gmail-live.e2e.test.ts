import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(
  fileURLToPath(new URL('../../../../', import.meta.url)),
)
const scriptPath = join(repoRoot, 'scripts/verify/live-gmail-sync.sh')
const liveTestsEnvKey = 'CTXINDEX_LIVE_TESTS'
const revokedGrantEnvKey = 'CTXINDEX_TEST_REVOKED_GRANT'

interface RunResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

async function runLiveGmailScript(
  env: Record<string, string | undefined> = {},
): Promise<RunResult> {
  const proc = Bun.spawn(['bash', scriptPath], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { exitCode, stdout, stderr }
}

function liveDbPath(): string {
  return join(process.env.HOME ?? '', '.local/share/ctxindex/ctxindex.sqlite')
}

test.skipIf(process.env[liveTestsEnvKey] !== '1')(
  'sync_runs completed after live sync',
  async () => {
    const result = await runLiveGmailScript()
    expect(result.exitCode, result.stderr).toBe(0)
    expect(result.stdout).toContain('sync_runs')
  },
)

test.skipIf(process.env[liveTestsEnvKey] !== '1')(
  'cursor_after is set after live sync',
  async () => {
    const result = await runLiveGmailScript()
    expect(result.exitCode, result.stderr).toBe(0)

    const db = new Database(liveDbPath(), { readonly: true })
    try {
      const row = db
        .prepare(
          `SELECT source_sync_state.cursor_json AS cursor_after
           FROM source_sync_state
           JOIN sources ON sources.id = source_sync_state.source_id
           WHERE sources.adapter_id = 'google.mailbox'
           ORDER BY sources.created_at DESC
           LIMIT 1`,
        )
        .get() as { cursor_after: string | null } | null
      expect(row?.cursor_after).not.toBeNull()
      expect(row?.cursor_after).toBeDefined()
    } finally {
      db.close()
    }
  },
)

test.skipIf(process.env[revokedGrantEnvKey] !== '1')(
  'revoked grant exits 10',
  async () => {
    const result = await runLiveGmailScript()
    expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(10)
    expect(result.stderr).toContain('grant revoked; re-auth required')
  },
)

test('missing live db exits 77', async () => {
  const emptyHome = await mkdtemp(join(tmpdir(), 'ctxindex-empty-home-'))
  const result = await runLiveGmailScript({ HOME: emptyHome })

  expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(77)
  expect(result.stderr).toContain('live ctxindex database not found')
})
