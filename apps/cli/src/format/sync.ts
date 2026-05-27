import type { SyncResult } from '@ctxindex/core/sync'

export interface SyncResultLine {
  readonly stdout?: string
  readonly stderr?: string
}

function isSuccess(status: SyncResult['status']): boolean {
  return status === 'success' || status === 'partial'
}

export function formatSyncResult(result: SyncResult): SyncResultLine {
  const counts = result.counts
  if (isSuccess(status_(result))) {
    const stdout =
      `sync completed: ${result.sourceId}\trun=${result.runId}` +
      `\titems=${counts.items}\tchunks=${counts.chunks}` +
      `\ttombstones=${counts.tombstones}`
    return result.error ? { stdout, stderr: result.error.message } : { stdout }
  }
  const stderr =
    `sync ${result.status}: ${result.sourceId}\trun=${result.runId}` +
    (result.error ? `\n${result.error.message}` : '')
  return { stderr }
}

export function formatSyncResults(
  results: readonly SyncResult[],
  opts: { readonly json: boolean },
): SyncResultLine[] {
  if (opts.json) return [{ stdout: JSON.stringify(results, null, 2) }]
  return results.map(formatSyncResult)
}

function status_(result: SyncResult): SyncResult['status'] {
  return result.status
}
