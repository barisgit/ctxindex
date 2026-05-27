import { CTXINDEX_ADAPTER_REGISTRY } from '@ctxindex/adapters'
import {
  type AdapterMigrations,
  bootstrapDatabase,
} from '@ctxindex/core/storage'
import { defineCommand } from 'citty'
import { runWithExit } from '../format/exit'

function adapterMigrations(): AdapterMigrations[] {
  return CTXINDEX_ADAPTER_REGISTRY.listMigrations() as AdapterMigrations[]
}

export async function initCtxindex(): Promise<void> {
  await bootstrapDatabase({ adapterMigrations: adapterMigrations() })
}

export const initCommand = defineCommand({
  meta: {
    name: 'init',
    description:
      'Set up ctxindex config, data, state, cache, logs, and SQLite.',
  },
  run: () =>
    runWithExit(async () => {
      await initCtxindex()
      console.log('ctxindex initialized')
      return 0
    }),
})
