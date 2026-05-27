import { expect, test } from 'bun:test'
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { gunzip } from 'node:zlib'
import * as TOML from '@iarna/toml'
import { defaultConfig, resetEnvForTests } from '../config'
import { createLogger, resetLoggerForTest } from './index'

const gunzipAsync = promisify(gunzip)
const logSyncEnvKey = 'CTXINDEX_LOG_SYNC'

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function readLogText(
  directory: string,
): Promise<{ files: string[]; text: string }> {
  const files = await readdir(directory)
  const chunks = await Promise.all(
    files
      .filter((file) => file.endsWith('.log') || file.endsWith('.gz'))
      .map(async (file) => {
        const bytes = await readFile(join(directory, file))
        return file.endsWith('.gz')
          ? (await gunzipAsync(bytes)).toString('utf8')
          : bytes.toString('utf8')
      }),
  )

  return { files, text: chunks.join('\n') }
}

test('rotated JSONL logs redact secret values', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ctxindex-logs-'))
  const logDirectory = join(sandbox, 'logs')
  const configPath = join(sandbox, 'config.toml')
  const config = defaultConfig()
  config.log.level = 'info'
  await writeFile(
    configPath,
    TOML.stringify(config as unknown as Parameters<typeof TOML.stringify>[0]),
  )

  const previousSync = process.env[logSyncEnvKey]
  delete process.env[logSyncEnvKey]
  resetEnvForTests()

  try {
    resetLoggerForTest()
    const logger = await createLogger({
      config,
      logDir: logDirectory,
      roll: { frequency: 100 },
    })

    for (let index = 0; index < 12; index++) {
      logger.info(
        {
          access_token: 'secret-AT',
          refresh_token: 'secret-RT',
          authorization: 'Bearer secret',
          nested: { apiKey: 'secret-key' },
          other: 'visible',
          index,
        },
        'redaction exercise',
      )
      await sleep(35)
    }

    await sleep(600)

    const { files, text } = await readLogText(logDirectory)
    expect(files.some((file) => file.endsWith('.gz'))).toBe(true)
    expect(text).not.toContain('secret-AT')
    expect(text).not.toContain('secret-RT')
    expect(text).not.toContain('Bearer secret')
    expect(text).toContain('"other":"visible"')
  } finally {
    if (previousSync === undefined) delete process.env[logSyncEnvKey]
    else process.env[logSyncEnvKey] = previousSync
    resetEnvForTests()
    resetLoggerForTest()
  }
})
