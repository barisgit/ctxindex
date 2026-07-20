import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { chmod, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Sandbox } from '@ctxindex/core/testing'
import { type MockGraphMessage, startMockGraph } from './_mock-graph'
import { installLoopbackBrowser } from './_oauth-account'

const repoRoot = new URL('../../../../', import.meta.url).pathname
const storageAcquireTrace = '[ctxindex-e2e] storage-acquire\n'

function parseSourceId(stdout: string): string {
  const match = /^source added: (.+)$/m.exec(stdout)
  if (!match?.[1]) throw new Error(`Could not parse Source id from: ${stdout}`)
  return match[1]
}

const messages: readonly MockGraphMessage[] = Array.from(
  { length: 12 },
  (_, index) => ({
    id: `concurrent-${index}`,
    conversationId: `conversation-${index}`,
    internetMessageId: `<concurrent-${index}@example.test>`,
    subject: `Concurrent result ${index}`,
    bodyPreview: `Concurrent preview ${index}`,
    body: `Concurrent body ${index}`,
    from: { address: 'sender@example.test' },
    to: [{ address: 'work@example.test' }],
    receivedDateTime: `2026-07-${String(index + 1).padStart(2, '0')}T10:00:00Z`,
    lastModifiedDateTime: `2026-07-${String(index + 1).padStart(2, '0')}T10:05:00Z`,
  }),
)

test('compiled CLI serializes concurrent remote-search cache batches across processes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ctxindex-concurrent-search-'))
  const buildPath = join(dir, 'build', 'ctxindex')
  const binaryPath = join(dir, 'bin', 'ctxindex')
  const sandbox = { dir } as Sandbox
  const graph = startMockGraph({
    messages,
    searchBarrierCount: 3,
    tokenScopes: 'Calendars.Read Mail.ReadWrite User.Read',
  })
  let lockDatabase: Database | undefined

  try {
    await mkdir(join(dir, 'build'), { recursive: true })
    await mkdir(join(dir, 'bin'), { recursive: true })
    const build = Bun.spawn(
      [
        'bun',
        'build',
        '--compile',
        '--define',
        '__CTXINDEX_E2E_TRACE_STORAGE_ACQUIRE__=true',
        'apps/cli/bin/ctxindex.mjs',
        '--outfile',
        buildPath,
      ],
      { cwd: repoRoot, stdout: 'pipe', stderr: 'pipe' },
    )
    const [buildStdout, buildStderr, buildExit] = await Promise.all([
      new Response(build.stdout).text(),
      new Response(build.stderr).text(),
      build.exited,
    ])
    expect(buildExit, `${buildStdout}\n${buildStderr}`).toBe(0)
    await Bun.write(binaryPath, Bun.file(buildPath))
    await chmod(binaryPath, 0o755)

    const browserBin = await installLoopbackBrowser(dir)
    const env = {
      ...process.env,
      ...graph.env(sandbox),
      CTXINDEX_CONFIG_HOME: join(dir, 'config'),
      CTXINDEX_DATA_HOME: join(dir, 'data'),
      CTXINDEX_CACHE_HOME: join(dir, 'cache'),
      CTXINDEX_STATE_HOME: join(dir, 'state'),
      CTXINDEX_KEYTAR_MOCK_FILE: join(dir, 'keytar.json'),
      CTXINDEX_LOOPBACK_TIMEOUT_SECS: '5',
      PATH: `${browserBin}:${process.env.PATH ?? ''}`,
    }
    const run = async (args: readonly string[]) => {
      const child = Bun.spawn([binaryPath, ...args], {
        cwd: '/',
        env,
        stdin: null,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ])
      return { stdout, stderr, exitCode }
    }
    const ok = async (args: readonly string[]) => {
      const result = await run(args)
      expect(result.exitCode, `${args.join(' ')}\n${result.stderr}`).toBe(0)
      return result
    }
    const startObservedSearch = () => {
      const child = Bun.spawn(
        [
          binaryPath,
          'search',
          'Concurrent',
          '--remote',
          '--source',
          'work-mailbox',
          '--limit',
          '20',
          '--json',
        ],
        {
          cwd: '/',
          env,
          stdin: null,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      )
      let markAcquireReached: (() => void) | undefined
      const acquireReached = new Promise<void>((resolve) => {
        markAcquireReached = resolve
      })
      const stderr = (async () => {
        const reader = child.stderr.getReader()
        const decoder = new TextDecoder()
        let output = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          output += decoder.decode(value, { stream: true })
          if (output.includes(storageAcquireTrace)) markAcquireReached?.()
        }
        output += decoder.decode()
        return output.replaceAll(storageAcquireTrace, '')
      })()
      return {
        acquireReached,
        result: Promise.all([
          new Response(child.stdout).text(),
          stderr,
          child.exited,
        ]).then(([stdout, childStderr, exitCode]) => ({
          stdout,
          stderr: childStderr,
          exitCode,
        })),
      }
    }

    await ok(['init'])
    await ok(['realm', 'add', 'work'])
    await ok(['oauth-app', 'add', 'microsoft', 'microsoft', '--from-env'])
    await ok([
      'account',
      'add',
      'microsoft',
      '--app',
      'microsoft',
      '--label',
      'work',
    ])
    const source = await ok([
      'source',
      'add',
      'microsoft.mailbox',
      '--realm',
      'work',
      '--account',
      'work',
      '--label',
      'work-mailbox',
    ])
    const sourceId = parseSourceId(source.stdout)

    lockDatabase = new Database(join(dir, 'data', 'ctxindex.sqlite'))
    lockDatabase.exec('PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE;')
    const pendingSearches = Array.from({ length: 3 }, startObservedSearch)
    await Promise.race([
      graph.waitForSearchBarrier(),
      Bun.sleep(5000).then(() => {
        throw new Error('Remote searches did not reach the provider barrier')
      }),
    ])
    graph.releaseSearchBarrier()
    await Promise.race([
      Promise.all(pendingSearches.map(({ acquireReached }) => acquireReached)),
      Bun.sleep(4000).then(() => {
        throw new Error(
          'Remote searches did not reach SQLite cache acquisition',
        )
      }),
    ])
    lockDatabase.exec('ROLLBACK')
    lockDatabase.close()
    lockDatabase = undefined
    const searches = await Promise.all(
      pendingSearches.map(({ result }) => result),
    )

    expect(
      searches.every(({ exitCode }) => exitCode === 0),
      JSON.stringify(searches),
    ).toBeTrue()
    for (const search of searches) {
      expect(search.stderr).not.toMatch(/SQLITE|database.*lock/i)
      const output = JSON.parse(search.stdout) as {
        results: { ref: string; sourceId: string; origin: string }[]
        warnings: { code: string; message: string }[]
      }
      expect(output.results, JSON.stringify(output)).toHaveLength(
        messages.length,
      )
      expect(
        output.results.every(
          ({ sourceId: resultSourceId, origin }) =>
            resultSourceId === sourceId && origin === 'provider',
        ),
      ).toBeTrue()
      expect(output.warnings).toEqual([])
    }

    const database = new Database(join(dir, 'data', 'ctxindex.sqlite'), {
      readonly: true,
    })
    try {
      expect(
        database.query('SELECT COUNT(*) AS count FROM resources').get(),
      ).toEqual({ count: messages.length })
      expect(
        database.query('SELECT COUNT(*) AS count FROM chunks').get(),
      ).toEqual({ count: messages.length * 4 })
      expect(
        database.query('SELECT COUNT(*) AS count FROM field_index').get(),
      ).toEqual({ count: messages.length * 4 })
      expect(
        database.query('SELECT COUNT(*) AS count FROM relations').get(),
      ).toEqual({ count: messages.length })
    } finally {
      database.close()
    }
  } finally {
    graph.releaseSearchBarrier()
    if (lockDatabase) {
      try {
        lockDatabase.exec('ROLLBACK')
      } catch {
        // The transaction may already be closed after an earlier failure.
      }
      lockDatabase.close()
    }
    graph.stop()
    await rm(dir, { recursive: true, force: true })
  }
}, 60_000)
