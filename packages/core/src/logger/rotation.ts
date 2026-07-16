/// <reference path="../types/pino-roll.d.ts" />

import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { gzip } from 'node:zlib'
import pino from 'pino'
import pinoRoll, { type PinoRollOptions } from 'pino-roll'
import type { CtxindexConfig } from '../config'
import { getEnv } from '../config/env-loader'

export type LoggerRollOptions = Partial<PinoRollOptions>

const gzipAsync = promisify(gzip)

async function compressRotatedLogs(
  directory: string,
  activeFile?: string,
): Promise<void> {
  const entries = await readdir(directory).catch(() => [])

  await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.startsWith('ctxindex.') &&
          entry.endsWith('.log') &&
          join(directory, entry) !== activeFile,
      )
      .map(async (entry) => {
        const path = join(directory, entry)
        const gzPath = `${path}.gz`
        const bytes = await readFile(path).catch(() => undefined)
        if (!bytes) return
        await writeFile(gzPath, await gzipAsync(bytes), { mode: 0o600 })
        await unlink(path).catch(() => undefined)
      }),
  )
}

export function scheduleCompression(
  directory: string,
  activeFile: () => string | undefined,
): void {
  for (const delay of [25, 100, 250]) {
    const timer = setTimeout(() => {
      void compressRotatedLogs(directory, activeFile())
    }, delay)
    if (!getEnv().CTXINDEX_TEST_LOG_ROTATE_BYTES) timer.unref()
  }
}

function testRollOptions(): LoggerRollOptions {
  if (process.env.NODE_ENV === 'production') return {}
  const raw = getEnv().CTXINDEX_TEST_LOG_ROTATE_BYTES
  if (!raw) return {}
  const bytes = Number(raw)
  if (!Number.isFinite(bytes) || bytes <= 0) return {}
  return { size: `${Math.trunc(bytes)}b` } as LoggerRollOptions
}

export async function createFileLogStream(
  directory: string,
  config: CtxindexConfig,
  roll?: LoggerRollOptions,
): Promise<{
  stream: pino.DestinationStream
  activeFile: () => string | undefined
}> {
  await mkdir(directory, { recursive: true, mode: 0o700 })

  if (getEnv().CTXINDEX_LOG_SYNC === '1') {
    const destination = pino.destination({
      dest: join(directory, 'ctxindex.log'),
      sync: true,
    })
    return {
      stream: destination,
      activeFile: () => join(directory, 'ctxindex.log'),
    }
  }

  const stream = await pinoRoll({
    file: join(directory, 'ctxindex'),
    extension: 'log',
    frequency: config.log.file.rotate,
    dateFormat: 'yyyy-MM-dd',
    limit: {
      count: config.log.file.retain_days,
      removeOtherLogFiles: true,
    },
    mkdir: true,
    ...testRollOptions(),
    ...roll,
  })

  return {
    stream: stream as pino.DestinationStream,
    activeFile: () => stream.file,
  }
}
