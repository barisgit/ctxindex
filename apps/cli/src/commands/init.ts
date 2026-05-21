import { chmod, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { CTXINDEX_ADAPTER_REGISTRY } from '@ctxindex/adapters'
import { defaultConfig, writeConfig } from '@ctxindex/core/config'
import {
  cacheDir,
  configDir,
  dataDir,
  logDir,
  stateDir,
} from '@ctxindex/core/paths'
import { openDatabase, runMigrations } from '@ctxindex/core/storage'
import { defineCommand } from 'citty'

async function ensurePrivateDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 })
  await chmod(path, 0o700).catch(() => undefined)
}

async function chmodIfExists(path: string, mode: number): Promise<void> {
  const file = Bun.file(path)
  if (await file.exists()) {
    await chmod(path, mode).catch(() => undefined)
  }
}

export async function initCtxindex(): Promise<void> {
  const cfgDir = configDir()
  const datDir = dataDir()
  const stDir = stateDir()
  const cchDir = cacheDir()
  const logsDir = logDir()

  await Promise.all([
    ensurePrivateDir(cfgDir),
    ensurePrivateDir(datDir),
    ensurePrivateDir(stDir),
    ensurePrivateDir(cchDir),
  ])
  await ensurePrivateDir(logsDir)

  const configPath = join(cfgDir, 'config.toml')
  if (!(await Bun.file(configPath).exists())) {
    await writeConfig(defaultConfig(), configPath)
  }

  await Promise.all([
    chmodIfExists(join(datDir, 'secrets.box'), 0o600),
    chmodIfExists(join(cfgDir, 'secret.key'), 0o600),
  ])

  const db = await openDatabase(join(datDir, 'ctxindex.sqlite'))
  try {
    await runMigrations(db, {
      adapterMigrations: CTXINDEX_ADAPTER_REGISTRY.listMigrations() as {
        namespace: string
        migrationsFolder: string
        migrationsTable: string
      }[],
    })
  } finally {
    db.close()
  }
}

export const initCommand = defineCommand({
  meta: {
    name: 'init',
    description:
      'Create ctxindex config, data, state, cache, logs, and SQLite files.',
  },
  async run() {
    await initCtxindex()
    console.log('ctxindex initialized')
  },
})
