import { CtxindexSyncError } from '@ctxindex/core/errors'
import type { SourceRow } from '@ctxindex/core/source'
import { databasePath } from '@ctxindex/core/storage'
import type { SyncResult } from '@ctxindex/core/sync'
import { defineCommand } from 'citty'
import { parseSyncArgs, type SyncArgs, syncUsage } from '../args/sync'
import { openDeps } from '../deps'
import { mapErrorToExit, runWithExit } from '../format/exit'
import { formatSyncResults } from '../format/sync'

function finish(
  results: readonly SyncResult[],
  opts: {
    readonly json: boolean
    readonly format: 'summary' | 'events' | 'compact'
  },
): number {
  let exit = 0
  for (const line of formatSyncResults(results, opts)) {
    if (line.stdout) console.log(line.stdout)
    if (line.stderr) console.error(line.stderr)
  }

  for (const r of results) {
    if (r.exitCode > exit) exit = r.exitCode
  }
  return exit
}

function syncStartLine(source: Pick<SourceRow, 'id' | 'adapter_id'>): string {
  return `sync_start source=${source.id} adapter=${source.adapter_id}`
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
      if (parsed.format === 'events') {
        const source = deps.sourceService.findSourceById(parsed.sourceId)
        console.log(
          syncStartLine(
            source ?? { id: parsed.sourceId, adapter_id: 'unknown' },
          ),
        )
      }
      const result = await deps.syncService.runSync({
        sourceId: parsed.sourceId,
        mode: parsed.mode,
      })
      return finish([result], parsed)
    }
    if (parsed.format === 'events') {
      const sources = deps.sourceService.listSources()
      if (sources.length === 0) {
        console.error('No sources configured. Run `ctxindex source add` first.')
        return 2
      }
      const results: SyncResult[] = []
      for (const source of sources) {
        console.log(syncStartLine(source))
        results.push(
          await deps.syncService.runSync({
            sourceId: source.id,
            mode: parsed.mode,
          }),
        )
      }
      return finish(results, parsed)
    }
    const results = await deps.syncService.runAllSources({ mode: parsed.mode })
    if (results.length === 0) {
      console.error('No sources configured. Run `ctxindex source add` first.')
      return 2
    }
    return finish(results, parsed)
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
    format: { type: 'string', description: 'Output format' },
  },
  run: ({ rawArgs }) => runWithExit(() => handleSyncCommand(rawArgs)),
})
