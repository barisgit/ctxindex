import { z } from 'zod'
import { logLevelSchema } from './schema'

const optionalString = z.string().optional()

const envShape = {
  CTXINDEX_CONFIG_HOME: optionalString,
  CTXINDEX_DATA_HOME: optionalString,
  CTXINDEX_STATE_HOME: optionalString,
  CTXINDEX_CACHE_HOME: optionalString,
  CTXINDEX_LOG_LEVEL: logLevelSchema.optional(),
  CTXINDEX_LOG_SYNC: optionalString,
  CTXINDEX_LOG_CANARY_TOKEN: optionalString,
  CTXINDEX_SECRETS_PASSPHRASE: optionalString,
  CTXINDEX_KEYTAR_MOCK_FILE: optionalString,
  CTXINDEX_NO_BROWSER: optionalString,
  CTXINDEX_LOOPBACK_TIMEOUT_SECS: optionalString,
  CTXINDEX_SKIP_TURBO_DRY_JSON: optionalString,
  CTXINDEX_GMAIL_AUTH_URL: optionalString,
  CTXINDEX_GMAIL_TOKEN_URL: optionalString,
  CTXINDEX_GMAIL_MOCK_BASE_URL: optionalString,
  CTXINDEX_GMAIL_CLIENT_ID: optionalString,
  CTXINDEX_GMAIL_CLIENT_SECRET: optionalString,
  CTXINDEX_GMAIL_REFRESH_TOKEN: optionalString,
  CTXINDEX_TEST_LOG_ROTATE_BYTES: optionalString,
  CTXINDEX_TEST_LOG_SPAM_BYTES: optionalString,
  CTXINDEX_TEST_SYNC_DELAY_MS: optionalString,
  XDG_CONFIG_HOME: optionalString,
  XDG_DATA_HOME: optionalString,
  XDG_STATE_HOME: optionalString,
  XDG_CACHE_HOME: optionalString,
} as const

export const EnvSchema = z.object(envShape).catchall(optionalString)

export type Env = Readonly<z.infer<typeof EnvSchema>>
export type EnvSchemaKey = keyof typeof envShape

export const ENV_SCHEMA_KEYS = Object.freeze(
  Object.keys(envShape) as EnvSchemaKey[],
)

let memoizedEnv: Env | undefined

export function getEnv(): Env {
  memoizedEnv ??= Object.freeze(EnvSchema.parse(process.env))
  return memoizedEnv
}

export function resetEnvForTests(): void {
  memoizedEnv = undefined
}
