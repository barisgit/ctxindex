import pino from 'pino'
import pinoPretty from 'pino-pretty'
import { type CtxindexConfig, type LogLevel, readConfig } from '../config'
import { getEnv } from '../config/env-loader'
import { logDir as defaultLogDir } from '../paths'
import { isPlainObject, REDACT_PATHS, sanitizeLogValue } from './redaction'
import {
  createFileLogStream,
  type LoggerRollOptions,
  scheduleCompression,
} from './rotation'

export type Logger = pino.Logger

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
  roll?: LoggerRollOptions
}

let memoizedLogger: Promise<pino.Logger> | undefined

function isLogLevel(value: string): value is LogLevel {
  return ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(value)
}

function resolveLevel(config: CtxindexConfig, override?: LogLevel): LogLevel {
  // An explicit override (the `--log-level` CLI flag) wins over the ambient
  // CTXINDEX_LOG_LEVEL env var, which in turn wins over the config default.
  if (override) return override
  const envLevel = getEnv().CTXINDEX_LOG_LEVEL
  if (envLevel && isLogLevel(envLevel)) return envLevel
  return config.log.level ?? 'info'
}

export async function createLogger(
  options: LoggerOptions = {},
): Promise<pino.Logger> {
  const config = options.config ?? (await readConfig())
  const directory = options.logDir ?? defaultLogDir()
  const level = resolveLevel(config, options.level)
  const file = await createFileLogStream(directory, config, options.roll)
  const streams: pino.StreamEntry[] = [{ level, stream: file.stream }]
  if (process.stderr.isTTY === true) {
    streams.unshift({
      level,
      stream: pinoPretty({ destination: 2, colorize: true, singleLine: true }),
    })
  }

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
              return method.apply(this, [
                sanitizeLogValue(firstArg),
                ...rest.map((entry) => sanitizeLogValue(entry)),
              ] as Parameters<typeof method>)
            }
          }
          return method.apply(
            this,
            inputArgs.map((entry) => sanitizeLogValue(entry)) as Parameters<
              typeof method
            >,
          )
        },
      },
    },
    pino.multistream(streams),
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
