/// <reference path="../types/sql.d.ts" />

import initSql from '../../migrations/0000_init.sql' with { type: 'text' }

export const coreMigrations = {
  namespace: 'core',
  migrations: [{ name: '0000_init.sql', sql: initSql }],
  migrationsTable: 'ctxindex_migrations_core',
} as const
