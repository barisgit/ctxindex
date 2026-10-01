import { Database } from 'bun:sqlite'
import { afterAll, beforeAll, expect, test } from 'bun:test'
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'
import {
  buildCompiledCliHarness,
  type CliResult,
  type CompiledCliHarness,
  isolatedChildEnvironment,
} from './_compiled-cli-harness'
import { type MockGmailServer, startMockGmail } from './_mock-gmail'
import { installLoopbackBrowser } from './_oauth-account'

// Compiled multi-process acceptance for daemon-owned Draft Actions, Artifact
// download/list/purge, and export. The relocated CLI and daemon executables run
// as separate processes against loopback provider mocks with synthetic
// credentials. Both are compiled with the storage-acquire trace, so a client
// that composed the runtime itself would print the trace on its own stderr.

const storageAcquireTrace = '[ctxindex-e2e] storage-acquire\n'
const traceDefine = ['--define', '__CTXINDEX_E2E_TRACE_STORAGE_ACQUIRE__=true']
const createActionId = 'mail.message.draft.create'
const sourceLabel = 'gmail-mailbox'
const deadlineMs = 15_000

let harness: CompiledCliHarness | undefined

beforeAll(async () => {
  harness = await buildCompiledCliHarness({
    cliBuildArgs: traceDefine,
    daemonBuildArgs: traceDefine,
  })
}, 60_000)

afterAll(async () => {
  await harness?.cleanup()
})

interface Gate {
  readonly method: string
  readonly pathname: RegExp
  readonly mode: 'hold' | 'truncate'
}

interface HeldRequest {
  readonly pathname: string
  aborted: boolean
}

// Loopback proxy in front of the Gmail mock. It forwards every request except
// one armed gate, which either holds the provider request open until the
// daemon aborts it or returns a body shorter than its declared length.
function startGatedProxy(target: string) {
  let gate: Gate | null = null
  const held: HeldRequest[] = []
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      const armed = gate
      if (
        armed &&
        request.method === armed.method &&
        armed.pathname.test(url.pathname)
      ) {
        gate = null
        if (armed.mode === 'truncate') {
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new TextEncoder().encode('{"data":"bW9j'))
                controller.close()
              },
            }),
            {
              headers: {
                'content-type': 'application/json',
                'content-length': '4096',
              },
            },
          )
        }
        const entry: HeldRequest = { pathname: url.pathname, aborted: false }
        held.push(entry)
        await new Promise<void>((resolve) => {
          request.signal.addEventListener('abort', () => {
            entry.aborted = true
            resolve()
          })
        })
        return new Response(null, { status: 503 })
      }
      const headers = new Headers(request.headers)
      headers.delete('host')
      headers.delete('accept-encoding')
      const upstream = await fetch(target + url.pathname + url.search, {
        method: request.method,
        headers,
        ...(request.method === 'GET' || request.method === 'HEAD'
          ? {}
          : { body: await request.arrayBuffer() }),
      })
      return new Response(await upstream.arrayBuffer(), {
        status: upstream.status,
        headers: {
          'content-type':
            upstream.headers.get('content-type') ?? 'application/json',
        },
      })
    },
  })
  return {
    url: server.url.toString().replace(/\/$/, ''),
    held,
    arm(next: Gate) {
      gate = next
    },
    stop() {
      server.stop(true)
    },
  }
}

async function pollUntil<T>(
  description: string,
  probe: () =>
    | T
    | null
    | undefined
    | false
    | Promise<T | null | undefined | false>,
): Promise<T> {
  const deadline = Date.now() + deadlineMs
  while (Date.now() <= deadline) {
    const value = await probe()
    if (value) return value
    await Bun.sleep(10)
  }
  throw new Error(`${description}: deadline exceeded`)
}

function parseSourceId(stdout: string): string {
  const match = /^source added: (.+)$/m.exec(stdout)
  if (!match?.[1]) throw new Error(`Could not parse source id from: ${stdout}`)
  return match[1]
}

function resourceCount(sandbox: Sandbox): number {
  const db = new Database(
    join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite'),
    {
      readonly: true,
    },
  )
  try {
    return (
      db.prepare('SELECT COUNT(*) AS count FROM resources').get() as {
        count: number
      }
    ).count
  } finally {
    db.close()
  }
}

test('compiled CLI routes Draft Actions, Artifacts, and export through one daemon', async () => {
  if (!harness) throw new Error('Compiled CLI harness was not initialized')
  const compiled = harness
  const sandbox = await createSandbox()
  const runtimeRoot = await mkdtemp('/tmp/ctxd-action-artifact-')
  const mock: MockGmailServer = startMockGmail()
  const proxy = startGatedProxy(mock.baseUrl)
  let env: Record<string, string | undefined> | undefined
  try {
    const browser = await installLoopbackBrowser(sandbox.dir)
    env = {
      ...sandbox.env,
      ...mock.env(sandbox, {
        HOME: sandbox.dir,
        PATH: `${browser}:${process.env.PATH ?? ''}`,
        CTXINDEX_LOOPBACK_TIMEOUT_SECS: '5',
        CTXINDEX_DAEMON_RUNTIME_ROOT: runtimeRoot,
        CTXINDEX_GMAIL_MOCK_BASE_URL: proxy.url,
      }),
    }
    const childEnv = env
    const run = (args: readonly string[]) => compiled.run(args, childEnv)
    const ok = async (args: readonly string[]): Promise<CliResult> => {
      const result = await run(args)
      expect(result.exitCode, `${args.join(' ')}\n${result.stderr}`).toBe(0)
      expect(result.stderr).not.toContain(storageAcquireTrace)
      return result
    }
    const spawnCli = (args: readonly string[]) => {
      const child = Bun.spawn([compiled.executable, ...args], {
        cwd: '/',
        env: isolatedChildEnvironment(childEnv),
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
      })
      return {
        child,
        result: Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ]).then(([exitCode, stdout, stderr]) => ({ exitCode, stdout, stderr })),
      }
    }
    const daemonInstance = async () => {
      const status = await ok(['daemon', 'status', '--format', 'json'])
      const parsed = JSON.parse(status.stdout) as {
        status: string
        health: { instanceId: string; pid: number }
      }
      expect(parsed.status).toBe('running')
      expect(parsed.health.pid).toBeGreaterThan(0)
      return { instanceId: parsed.health.instanceId, pid: parsed.health.pid }
    }

    await ok(['init'])
    await ok(['realm', 'add', 'mail'])
    await ok(['oauth-app', 'add', 'google', 'google', '--from-env'])
    await ok([
      'account',
      'add',
      'google',
      '--app',
      'google',
      '--label',
      'gmail',
    ])
    const sourceId = parseSourceId(
      (
        await ok([
          'source',
          'add',
          'google.mailbox',
          '--realm',
          'mail',
          '--account',
          'gmail',
          '--label',
          sourceLabel,
        ])
      ).stdout,
    )
    const owner = await daemonInstance()
    mock.resetRequests()
    mock.resetDraftState()

    // Description resolves through the daemon's immutable active registry.
    const described = await ok([
      'describe',
      'action',
      createActionId,
      '--source',
      sourceLabel,
      '--format',
      'json',
    ])
    expect(described.stderr).toBe('')
    expect(JSON.parse(described.stdout)).toMatchObject({
      id: createActionId,
      effect: 'reversible',
      sources: [
        { id: sourceId, adapter: { id: 'google.mailbox' }, available: true },
      ],
    })
    const unknown = await run([
      'describe',
      'action',
      'mail.message.draft.send',
      '--source',
      sourceLabel,
      '--format',
      'json',
    ])
    expect(unknown.exitCode).toBe(2)
    expect(unknown.stderr).toContain('Unknown Action')
    const malformed = await run([
      'action',
      'run',
      createActionId,
      '--source',
      sourceLabel,
      '--input',
      '{not-json',
    ])
    expect(malformed.exitCode).toBe(2)
    expect(mock.readRecordedRequests()).toEqual([])

    const createInput = {
      to: ['first@example.test'],
      subject: 'Daemon draft',
      bodyText: 'Created through the daemon',
    }
    const actionArgs = [
      'action',
      'run',
      createActionId,
      '--source',
      sourceLabel,
      '--input',
      JSON.stringify(createInput),
      '--format',
      'json',
    ] as const

    // Cancelling the CLI aborts the daemon-owned provider request; nothing is
    // forwarded to the provider or persisted, and the daemon keeps serving.
    proxy.arm({ method: 'POST', pathname: /\/drafts$/, mode: 'hold' })
    const cancelledRun = spawnCli(actionArgs)
    await pollUntil('held Draft request', () => proxy.held.length === 1)
    cancelledRun.child.kill('SIGINT')
    const cancelled = await cancelledRun.result
    expect(cancelled.exitCode, cancelled.stderr).toBe(130)
    expect(cancelled.stdout).toBe('')
    await pollUntil('aborted Draft request', () => proxy.held[0]?.aborted)
    expect(mock.readRecordedRequests()).toEqual([])
    expect(resourceCount(sandbox)).toBe(0)

    const created = await ok(actionArgs)
    expect(created.stderr).toBe('')
    const createdJson = JSON.parse(created.stdout)
    expect(createdJson).toMatchObject({
      resource: {
        ref: `ctx://${sourceId}/draft/draft-1`,
        sourceId,
        profile: { id: 'mail.message', version: 1 },
        title: 'Daemon draft',
        payload: { providerDraftId: 'draft-1', ...createInput },
      },
      warnings: [],
    })
    expect(
      mock
        .readRecordedRequests()
        .map(({ method, pathname }) => [method, pathname]),
    ).toEqual([['POST', '/gmail/v1/users/me/drafts']])
    expect(resourceCount(sandbox)).toBe(1)
    // The Resource was persisted by the daemon, never by the CLI process.
    expect(
      await readFile(
        join(sandbox.env.CTXINDEX_STATE_HOME, 'daemon', 'startup.log'),
        'utf8',
      ),
    ).toContain(storageAcquireTrace)

    // Artifacts and export over the daemon's byte-transfer boundary.
    const messageRef = `ctx://${sourceId}/message/msg-1`
    await ok(['get', messageRef, '--format', 'json'])
    const listed = JSON.parse(
      (await ok(['artifact', 'list', messageRef, '--format', 'json'])).stdout,
    ) as { artifacts: { ref: string; byteSize?: number }[] }
    const artifactRef = listed.artifacts[0]?.ref
    if (!artifactRef)
      throw new Error('Expected one Gmail attachment descriptor')
    expect(listed.artifacts).toHaveLength(1)
    const outputs = join(sandbox.dir, 'outputs')
    await Bun.write(join(outputs, '.keep'), '')
    await rm(join(outputs, '.keep'))
    const destination = join(outputs, 'attachment.txt')
    const attachmentPath = /\/attachments\//

    proxy.arm({ method: 'GET', pathname: attachmentPath, mode: 'truncate' })
    const truncated = await run([
      'artifact',
      'download',
      artifactRef,
      '--output',
      destination,
      '--format',
      'json',
    ])
    // A truncated provider body is a provider failure (stable exit 30).
    expect(truncated.exitCode, truncated.stderr).toBe(30)
    expect(truncated.stdout).toBe('')
    expect(truncated.stderr).not.toContain(sandbox.dir)
    expect(await readdir(outputs)).toEqual([])

    proxy.arm({ method: 'GET', pathname: attachmentPath, mode: 'hold' })
    const cancelledDownload = spawnCli([
      'artifact',
      'download',
      artifactRef,
      '--output',
      destination,
      '--format',
      'json',
    ])
    await pollUntil('held attachment request', () => proxy.held.length === 2)
    cancelledDownload.child.kill('SIGINT')
    const cancelledArtifact = await cancelledDownload.result
    expect(cancelledArtifact.exitCode, cancelledArtifact.stderr).toBe(130)
    expect(cancelledArtifact.stdout).toBe('')
    await pollUntil('aborted attachment request', () => proxy.held[1]?.aborted)
    expect(await readdir(outputs)).toEqual([])

    mock.resetRequests()
    const miss = await ok([
      'artifact',
      'download',
      artifactRef,
      '--output',
      destination,
      '--format',
      'json',
    ])
    expect(JSON.parse(miss.stdout)).toMatchObject({
      cache: 'miss',
      outputPath: destination,
    })
    expect(miss.stdout).not.toContain(sandbox.env.CTXINDEX_CACHE_HOME)
    expect(await readFile(destination, 'utf8')).toBe('mock attachment text')
    expect((await stat(destination)).mode & 0o777).toBe(0o600)
    expect(
      mock
        .readRecordedRequests()
        .filter(({ pathname }) => attachmentPath.test(pathname)),
    ).toHaveLength(1)

    mock.resetRequests()
    const second = join(outputs, 'second.txt')
    const hit = await ok([
      'artifact',
      'download',
      artifactRef,
      '--output',
      second,
      '--format',
      'json',
    ])
    expect(JSON.parse(hit.stdout)).toMatchObject({ cache: 'hit' })
    expect(await readFile(second, 'utf8')).toBe('mock attachment text')
    const receipt = await ok([
      'artifact',
      'download',
      artifactRef,
      '--format',
      'json',
    ])
    const receiptJson = JSON.parse(receipt.stdout)
    expect(receiptJson).toMatchObject({
      cache: 'hit',
      artifact: { ref: artifactRef },
    })
    expect(receiptJson).not.toHaveProperty('outputPath')
    expect(mock.readRecordedRequests()).toEqual([])

    await writeFile(destination, 'operator data')
    const exists = await run([
      'artifact',
      'download',
      artifactRef,
      '--output',
      destination,
      '--format',
      'json',
    ])
    expect(exists.exitCode).toBe(2)
    expect(exists.stderr).toContain('Output path already exists')
    expect(await readFile(destination, 'utf8')).toBe('operator data')
    expect((await readdir(outputs)).sort()).toEqual([
      'attachment.txt',
      'second.txt',
    ])

    const eml = await ok(['export', messageRef, '--format', 'eml'])
    expect(eml.stdout).toContain('Subject: ctxindex mock hello')
    const exported = await ok(['export', messageRef, '--format', 'json'])
    expect(JSON.parse(exported.stdout)).toMatchObject({
      attachments: [{ ref: artifactRef }],
    })

    const purged = await ok(['artifact', 'purge', '--format', 'json'])
    expect(JSON.parse(purged.stdout)).toMatchObject({
      artifactCountRemoved: 1,
      objectCountRemoved: 1,
    })

    // One daemon instance owned every stateful command above.
    expect(await daemonInstance()).toEqual(owner)
    expect(
      mock.readRequests().every(({ pathname }) => !pathname.includes('/send')),
    ).toBe(true)
  } finally {
    if (env) {
      await compiled
        .run(['daemon', 'stop', '--format', 'json'], env)
        .catch(() => undefined)
    }
    proxy.stop()
    mock.stop()
    await sandbox.cleanup()
    await rm(runtimeRoot, { recursive: true, force: true })
  }
}, 90_000)
