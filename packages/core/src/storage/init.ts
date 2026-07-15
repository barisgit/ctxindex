import { chmod, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { configPath, writeConfig } from '../config'
import { cacheDir, configDir, dataDir, logDir, stateDir } from '../paths'
import { databasePath, openDatabase } from './db'
import { runMigrations } from './migrator'

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

export async function bootstrapDatabase(): Promise<void> {
  const cfgDir = configDir()
  const datDir = dataDir()

  await Promise.all([
    ensurePrivateDir(cfgDir),
    ensurePrivateDir(datDir),
    ensurePrivateDir(stateDir()),
    ensurePrivateDir(cacheDir()),
  ])
  await ensurePrivateDir(logDir())

  const cfgPath = configPath()
  if (!(await Bun.file(cfgPath).exists())) {
    await writeConfig(undefined, cfgPath)
  }

  await Promise.all([
    chmodIfExists(join(datDir, 'secrets.box'), 0o600),
    chmodIfExists(join(cfgDir, 'secret.key'), 0o600),
  ])

  const db = await openDatabase(databasePath())
  try {
    await runMigrations(db)
  } finally {
    db.close()
  }
}
