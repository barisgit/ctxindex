import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import * as TOML from '@iarna/toml'
import { CtxindexConfigError } from '../errors'
import { configDir } from '../paths'
import { assertSecretUri } from './env-uri'
import { type CtxindexConfig, configSchema, defaultConfig } from './schema'

export function configPath(): string {
  return join(configDir(), 'config.toml')
}

function validateSecretReferences(config: unknown): void {
  if (!config || typeof config !== 'object') return
  const secrets = (config as { secrets?: unknown }).secrets
  if (!secrets || typeof secrets !== 'object') return
  const passphraseEnv = (secrets as { passphrase_env?: unknown }).passphrase_env
  if (typeof passphraseEnv === 'string') {
    assertSecretUri(passphraseEnv, 'secrets.passphrase_env')
  }
}

export async function readConfig(
  filePath: string = configPath(),
): Promise<CtxindexConfig> {
  const file = Bun.file(filePath)
  if (!(await file.exists())) return defaultConfig()

  let parsed: unknown
  try {
    parsed = TOML.parse(await file.text())
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    throw Object.assign(
      new CtxindexConfigError(
        `failed to parse config.toml: ${message}`,
        'env_loader_invalid',
        { cause },
      ),
      { exitCode: 40 },
    )
  }
  validateSecretReferences(parsed)
  return configSchema.parse(parsed)
}

export async function writeConfig(
  config: CtxindexConfig = defaultConfig(),
  filePath: string = configPath(),
): Promise<void> {
  validateSecretReferences(config)
  const parsed = configSchema.parse(config)
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  const toml = TOML.stringify(
    parsed as unknown as Parameters<typeof TOML.stringify>[0],
  )

  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 })
  await writeFile(tmpPath, toml, { mode: 0o600 })
  await rename(tmpPath, filePath)
}
