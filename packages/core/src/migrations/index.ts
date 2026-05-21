import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

export const coreMigrations = {
  namespace: 'core',
  migrationsFolder: resolve(here, '..', '..', 'migrations'),
  migrationsTable: 'ctxindex_migrations_core',
} as const
