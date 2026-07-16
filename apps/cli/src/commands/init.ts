import { initializeSecretBackend } from '@ctxindex/core/secrets'
import { bootstrapDatabase } from '@ctxindex/core/storage'
import { defineCommand } from 'citty'
import { runWithExit } from '../format/exit'

export async function initCtxindex(): Promise<void> {
  await initializeSecretBackend()
  await bootstrapDatabase()
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
