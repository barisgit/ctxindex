import type { SyncResult } from '@ctxindex/core/sync'

export interface SyncResultLine {
  readonly stdout?: string
  readonly stderr?: string
}

function compactResult(result: SyncResult): SyncResultLine {
  const c = result.counts
  const fields = [
    `sync_${result.exitCode === 0 ? 'done' : 'failed'}`,
    `source=${result.sourceId}`,
    `run=${result.runId}`,
    `status=${result.lastStatus}`,
    `items=${c.items}`,
    `chunks=${c.chunks}`,
    `tombstones=${c.tombstones}`,
    `errors=${c.errors}`,
  ]
  if (result.error) fields.push(`error=${result.error.code}`)
  return { stdout: fields.join(' ') }
}

function eventResult(result: SyncResult): SyncResultLine {
  return compactResult(result)
}

export type SyncFormat = 'summary' | 'events' | 'compact'

function isSuccess(status: SyncResult['status']): boolean {
  return status === 'success' || status === 'partial'
}

export function formatSyncResult(result: SyncResult): SyncResultLine {
  const counts = result.counts
  if (isSuccess(status_(result))) {
    const stdout =
      `sync completed: ${result.sourceId}\trun=${result.runId}` +
      `\titems=${counts.items}\tchunks=${counts.chunks}` +
      `\ttombstones=${counts.tombstones}` +
      // V1 §1.6: the one-line summary prints errors_count only when non-zero.
      (counts.errors > 0 ? `\terrors=${counts.errors}` : '')
    return result.error ? { stdout, stderr: result.error.message } : { stdout }
  }
  const stderr =
    `sync ${result.status}: ${result.sourceId}\trun=${result.runId}` +
    (result.error ? `\n${result.error.message}` : '')
  return { stderr }
}

export function formatSyncResults(
  results: readonly SyncResult[],
  opts: { readonly json: boolean; readonly format?: SyncFormat },
): SyncResultLine[] {
  if (opts.json) return [{ stdout: JSON.stringify(results, null, 2) }]
  if (opts.format === 'compact') return results.map(compactResult)
  if (opts.format === 'events') return results.map(eventResult)
  return results.map(formatSyncResult)
}

function status_(result: SyncResult): SyncResult['status'] {
  return result.status
}
