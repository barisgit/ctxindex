import { CtxindexSyncError } from '@ctxindex/core/errors'
import { databasePath } from '@ctxindex/core/storage'
import type { SyncResult } from '@ctxindex/core/sync'
import { defineCommand } from 'citty'
import { parseSyncArgs, type SyncArgs, syncUsage } from '../args/sync'
import { openDeps } from '../deps'
import { mapErrorToExit, runWithExit } from '../format/exit'
import { formatSyncResults } from '../format/sync'

function finish(results: readonly SyncResult[], json: boolean): number {
  let exit = 0
  for (const line of formatSyncResults(results, { json })) {
    if (line.stdout) console.log(line.stdout)
    if (line.stderr) console.error(line.stderr)
  }
  for (const r of results) {
    if (r.exitCode > exit) exit = r.exitCode
  }
  return exit
}

async function run(
  parsed: Extract<SyncArgs, { kind: 'run' }>,
): Promise<number> {
  if (!(await Bun.file(databasePath()).exists())) {
    console.error('ctxindex is not initialized. Run `ctxindex init` first.')
    return 2
  }
  const deps = await openDeps()
  try {
    if (parsed.sourceId) {
      const result = await deps.syncService.runSync({
        sourceId: parsed.sourceId,
        mode: parsed.mode,
      })
      return finish([result], parsed.json)
    }
    const results = await deps.syncService.runAllSources({ mode: parsed.mode })
    if (results.length === 0) {
      console.error('No sources configured. Run `ctxindex source add` first.')
      return 2
    }
    return finish(results, parsed.json)
  } catch (err) {
    if (err instanceof Error && /^source not found:/.test(err.message)) {
      console.error(err.message)
      return 2
    }
    console.error(err instanceof Error ? err.message : String(err))
    return err instanceof CtxindexSyncError ? mapErrorToExit(err) : 2
  } finally {
    await deps.close()
  }
}

export async function handleSyncCommand(args: string[]): Promise<number> {
  const parsed = parseSyncArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${syncUsage}`)
    return 2
  }
  return run(parsed)
}

export const syncCommand = defineCommand({
  meta: { name: 'sync', description: 'Run a sync for one or all sources.' },
  args: {
    source: { type: 'string', description: 'Source ID' },
    mode: {
      type: 'enum',
      options: ['sync', 'resync', 'diff'],
      description: 'Sync mode',
    },
    json: { type: 'boolean', description: 'Print JSON' },
  },
  run: ({ rawArgs }) => runWithExit(() => handleSyncCommand(rawArgs)),
})
