import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { gzip } from 'node:zlib'
import pino from 'pino'
import pinoPretty from 'pino-pretty'
import pinoRoll, { type PinoRollOptions } from 'pino-roll'
import { type CtxindexConfig, type LogLevel, readConfig } from '../config'
import { logDir as defaultLogDir } from '../paths'

export type Logger = pino.Logger

const gzipAsync = promisify(gzip)

const REDACT_PATHS = [
  '*.access_token',
  '*.refresh_token',
  '*.authorization',
  '*.cookie',
  '*.password',
  '*.apiKey',
] as const

const SENSITIVE_FIELDS = new Set(
  REDACT_PATHS.map((path) => path.slice(path.indexOf('.') + 1)),
)

export type LoggerBindings = {
  runId?: string
  sourceId?: string
  adapterId?: string
  accountId?: string
  realmId?: string
  op?: string
}

export type LoggerOptions = {
  config?: CtxindexConfig
  logDir?: string
  level?: LogLevel
  roll?: Partial<PinoRollOptions>
}

let memoizedLogger: Promise<pino.Logger> | undefined

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function sanitizeLogValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => sanitizeLogValue(entry))
  if (!isPlainObject(value)) return value

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_FIELDS.has(key) ? '[Redacted]' : sanitizeLogValue(entry),
    ]),
  )
}

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

function scheduleCompression(
  directory: string,
  activeFile: () => string | undefined,
): void {
  for (const delay of [25, 100, 250]) {
    setTimeout(() => {
      void compressRotatedLogs(directory, activeFile())
    }, delay).unref()
  }
}

function isLogLevel(value: string): value is LogLevel {
  return ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(value)
}

function resolveLevel(config: CtxindexConfig, override?: LogLevel): LogLevel {
  const envLevel = process.env.CTXINDEX_LOG_LEVEL
  if (envLevel && isLogLevel(envLevel)) return envLevel
  return override ?? config.log.level ?? 'info'
}

async function fileStream(
  directory: string,
  config: CtxindexConfig,
  roll?: Partial<PinoRollOptions>,
): Promise<{
  stream: pino.DestinationStream
  activeFile: () => string | undefined
}> {
  await mkdir(directory, { recursive: true, mode: 0o700 })

  if (process.env.CTXINDEX_LOG_SYNC === '1') {
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
    ...roll,
  })

  return {
    stream: stream as pino.DestinationStream,
    activeFile: () => stream.file,
  }
}

export async function createLogger(
  options: LoggerOptions = {},
): Promise<pino.Logger> {
  const config = options.config ?? (await readConfig())
  const directory = options.logDir ?? defaultLogDir()
  const level = resolveLevel(config, options.level)
  const file = await fileStream(directory, config, options.roll)
  const stderrStream =
    process.stderr.isTTY === true
      ? pinoPretty({ destination: 2, colorize: true, singleLine: true })
      : pino.destination({ dest: 2, sync: false })

  return pino(
    {
      level,
      redact: { paths: [...REDACT_PATHS], censor: '[Redacted]' },
      hooks: {
        logMethod(inputArgs, method) {
          if (config.log.file.compress) {
            scheduleCompression(directory, file.activeFile)
          }
          if (inputArgs.length > 0) {
            const [firstArg, ...rest] = inputArgs
            if (isPlainObject(firstArg)) {
              return method.apply(this, [sanitizeLogValue(firstArg), ...rest])
            }
          }
          return method.apply(this, inputArgs)
        },
      },
    },
    pino.multistream([
      { level, stream: stderrStream },
      { level, stream: file.stream },
    ]),
  )
}

export function logger(options: LoggerOptions = {}): Promise<pino.Logger> {
  memoizedLogger ??= createLogger(options)
  return memoizedLogger
}

export async function child(bindings: LoggerBindings): Promise<pino.Logger> {
  return (await logger()).child(bindings)
}

export function resetLoggerForTest(): void {
  memoizedLogger = undefined
}
