import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import * as TOML from '@iarna/toml'
import { configDir } from '../paths'
import { type CtxindexConfig, configSchema, defaultConfig } from './schema'

export function configPath(): string {
  return join(configDir(), 'config.toml')
}

export async function readConfig(
  filePath: string = configPath(),
): Promise<CtxindexConfig> {
  const file = Bun.file(filePath)
  if (!(await file.exists())) return defaultConfig()

  const parsed = TOML.parse(await file.text())
  return configSchema.parse(parsed)
}

export async function writeConfig(
  config: CtxindexConfig = defaultConfig(),
  filePath: string = configPath(),
): Promise<void> {
  const parsed = configSchema.parse(config)
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  const toml = TOML.stringify(
    parsed as unknown as Parameters<typeof TOML.stringify>[0],
  )

  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 })
  await writeFile(tmpPath, toml, { mode: 0o600 })
  await rename(tmpPath, filePath)
}
