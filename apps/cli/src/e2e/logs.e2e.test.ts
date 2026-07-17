import { expect, test } from 'bun:test'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { gunzip } from 'node:zlib'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'

const gunzipAsync = promisify(gunzip)
const canary = 'AKZX-CANARY-1234'

function logDir(sandbox: Sandbox): string {
  return join(sandbox.env.CTXINDEX_STATE_HOME, 'logs')
}

function parseSourceId(stdout: string): string {
  const match = /^source added: (.+)$/m.exec(stdout)
  if (!match?.[1]) throw new Error(`Could not parse source id from: ${stdout}`)
  return match[1]
}

async function initAndSource(
  sandbox: Sandbox,
  env: Record<string, string | undefined>,
): Promise<string> {
  const init = await sandbox.run(['init'], { env })
  expect(init.exitCode, init.stderr).toBe(0)
  const realm = await sandbox.run(['realm', 'add', 'logs'], { env })
  expect(realm.exitCode, realm.stderr).toBe(0)
  const root = join(sandbox.dir, 'logs-source')
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'note.txt'), 'log fixture\n')
  const added = await sandbox.run(
    [
      'source',
      'add',
      'local.directory',
      '--realm',
      'logs',
      '--config-root-path',
      root,
    ],
    { env },
  )
  expect(added.exitCode, added.stderr).toBe(0)
  return parseSourceId(added.stdout)
}

async function readLogText(
  sandbox: Sandbox,
): Promise<{ files: string[]; text: string; rotatedText: string }> {
  const directory = logDir(sandbox)
  const files = await readdir(directory).catch(() => [])
  const chunks: string[] = []
  const rotatedChunks: string[] = []
  for (const file of files) {
    if (!file.endsWith('.log') && !file.endsWith('.gz')) continue
    const bytes = await readFile(join(directory, file))
    const text = file.endsWith('.gz')
      ? (await gunzipAsync(bytes)).toString('utf8')
      : bytes.toString('utf8')
    chunks.push(text)
    if (file.endsWith('.gz')) rotatedChunks.push(text)
  }
  return {
    files,
    text: chunks.join('\n'),
    rotatedText: rotatedChunks.join('\n'),
  }
}

function expectNoTokenLeaks(text: string): void {
  expect(text).not.toMatch(/access_token|refresh_token/i)
  expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9]/)
  expect(text).not.toContain(canary)
}

async function runLoggedSync(
  envExtra: Record<string, string | undefined> = {},
): Promise<{
  sandbox: Sandbox
  sourceId: string
  env: Record<string, string | undefined>
}> {
  const sandbox = await createSandbox()
  const env = envExtra
  const sourceId = await initAndSource(sandbox, env)
  const sync = await sandbox.run(['sync', '--source', sourceId], { env })
  expect(sync.exitCode, sync.stderr).toBe(0)
  return { sandbox, sourceId, env }
}

test('no tokens in logs', async () => {
  const { sandbox } = await runLoggedSync({
    CTXINDEX_LOG_SYNC: '1',
    CTXINDEX_LOG_CANARY_TOKEN: canary,
  })
  try {
    const { text } = await readLogText(sandbox)
    expectNoTokenLeaks(text)
  } finally {
    await sandbox.cleanup()
  }
}, 30_000)

test('log file exists after sync', async () => {
  const { sandbox } = await runLoggedSync({ CTXINDEX_LOG_SYNC: '1' })
  try {
    const { files } = await readLogText(sandbox)
    expect(files).toContain('ctxindex.log')
  } finally {
    await sandbox.cleanup()
  }
}, 30_000)

test('rotation fires log.gz exists', async () => {
  const { sandbox, sourceId, env } = await runLoggedSync({
    CTXINDEX_LOG_LEVEL: 'debug',
    CTXINDEX_LOG_CANARY_TOKEN: canary,
    CTXINDEX_TEST_LOG_ROTATE_BYTES: '128',
    CTXINDEX_TEST_LOG_SPAM_BYTES: '4096',
  })
  try {
    for (let index = 0; index < 2; index++) {
      const sync = await sandbox.run(['sync', '--source', sourceId], { env })
      expect(sync.exitCode, sync.stderr).toBe(0)
    }
    await Bun.sleep(400)
    const { files } = await readLogText(sandbox)
    expect(files.some((file) => file.endsWith('.log.gz'))).toBe(true)
  } finally {
    await sandbox.cleanup()
  }
}, 30_000)

test('rotated log redacted', async () => {
  const { sandbox, sourceId, env } = await runLoggedSync({
    CTXINDEX_LOG_LEVEL: 'debug',
    CTXINDEX_LOG_CANARY_TOKEN: canary,
    CTXINDEX_TEST_LOG_ROTATE_BYTES: '128',
    CTXINDEX_TEST_LOG_SPAM_BYTES: '4096',
  })
  try {
    const sync = await sandbox.run(['sync', '--source', sourceId], { env })
    expect(sync.exitCode, sync.stderr).toBe(0)
    await Bun.sleep(400)
    const { files, rotatedText } = await readLogText(sandbox)
    expect(files.some((file) => file.endsWith('.log.gz'))).toBe(true)
    expectNoTokenLeaks(rotatedText)
  } finally {
    await sandbox.cleanup()
  }
}, 30_000)

test('canary token not leaked', async () => {
  const { sandbox, sourceId, env } = await runLoggedSync({
    CTXINDEX_LOG_LEVEL: 'debug',
    CTXINDEX_LOG_CANARY_TOKEN: canary,
    CTXINDEX_TEST_LOG_ROTATE_BYTES: '128',
    CTXINDEX_TEST_LOG_SPAM_BYTES: '4096',
  })
  try {
    const sync = await sandbox.run(['sync', '--source', sourceId], { env })
    expect(sync.exitCode, sync.stderr).toBe(0)
    await Bun.sleep(400)
    const { text } = await readLogText(sandbox)
    expect(text).not.toContain(canary)
  } finally {
    await sandbox.cleanup()
  }
}, 30_000)
