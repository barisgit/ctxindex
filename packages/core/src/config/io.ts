import { mkdir, realpath, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import * as TOML from '@iarna/toml'
import { CtxindexConfigError } from '../errors'
import { configDir } from '../paths'
import { type CtxindexConfig, configSchema, defaultConfig } from './schema'

export function configPath(): string {
  return join(configDir(), 'config.toml')
}

/**
 * Projects configured Extension paths into a launch-directory-independent form.
 *
 * A relative path is relative to the configuration file that holds it, never
 * to the working directory of the process reading it, so the CLI and a daemon
 * started elsewhere activate the same Extension. The real configuration
 * directory is the origin so `..` behaves as the filesystem does when the
 * configuration home is reached through a symlink.
 */
async function canonicalizeExtensionPaths(
  config: CtxindexConfig,
  filePath: string,
): Promise<CtxindexConfig> {
  if (config.extensions.paths.length === 0) return config

  const origin = await realpath(dirname(resolve(filePath)))
  return {
    ...config,
    extensions: {
      ...config.extensions,
      paths: config.extensions.paths.map((path) => resolve(origin, path)),
    },
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
  return canonicalizeExtensionPaths(configSchema.parse(parsed), filePath)
}

export async function writeConfig(
  config: CtxindexConfig = defaultConfig(),
  filePath: string = configPath(),
): Promise<void> {
  const parsed = configSchema.parse(config)
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 })

  const canonical = await canonicalizeExtensionPaths(parsed, filePath)
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  const toml = TOML.stringify(
    canonical as unknown as Parameters<typeof TOML.stringify>[0],
  )
  await writeFile(tmpPath, toml, { mode: 0o600 })
  await rename(tmpPath, filePath)
}
