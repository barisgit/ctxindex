import { defineCtxCommand } from '../command-model'
import { initializeDirectStorage } from '../direct-database'
import { runWithExit } from '../format/exit'

export async function initCtxindex(): Promise<void> {
  await initializeDirectStorage()
}

export const initCommand = defineCtxCommand({
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
