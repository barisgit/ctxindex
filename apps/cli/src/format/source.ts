import { dirname } from 'node:path'
import type { SourceRow } from '@ctxindex/core/source'
import Table from 'cli-table3'

export function formatSourceAdded(sourceId: string): string {
  return `source added: ${sourceId}`
}

function displayStatus(source: SourceRow): string {
  return source.availability === 'extension_unavailable'
    ? source.availability
    : (source.last_status ?? '-')
}

function compactValue(value: string | number | null | undefined): string {
  const text =
    value === null || value === undefined || value === '' ? '-' : String(value)
  return text.replace(/\s+/g, '_')
}

function compactSource(source: SourceRow): string {
  return [
    source.id,
    `label=${compactValue(source.label)}`,
    `adapter=${compactValue(source.adapter_id)}`,
    `realm=${compactValue(source.realm_slug ?? source.realm_id)}`,
    `ref=${compactValue(sourceRef(source))}`,
    `status=${compactValue(displayStatus(source))}`,
    `items=${source.items_count ?? 0}`,
    `chunks=${source.chunks_count ?? 0}`,
    `errors=${source.errors_count ?? 0}`,
  ].join(' ')
}

export function formatSourceRemoved(sourceId: string): string {
  return `source removed: ${sourceId}`
}

function parseConfig(configJson: string | null): Record<string, unknown> {
  if (!configJson) return {}
  try {
    const parsed = JSON.parse(configJson) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function sourceRef(source: SourceRow): string {
  const config = parseConfig(source.config_json)
  const rootPath = config.root_path ?? config.root ?? config.path
  if (typeof rootPath === 'string') return rootPath
  if (
    typeof source.account_email === 'string' &&
    source.account_email.length > 0
  ) {
    return source.account_email
  }
  if (
    source.adapter_id === 'local.directory' &&
    source.sample_uri?.startsWith('file://')
  ) {
    return dirname(decodeURIComponent(new URL(source.sample_uri).pathname))
  }
  const account = config.account ?? config.email ?? config.user
  if (typeof account === 'string') return account
  return '-'
}

function lastRun(source: SourceRow): string {
  return source.last_run_at
    ? new Date(source.last_run_at).toISOString().replace('T', ' ').slice(0, 16)
    : '-'
}

function rootPath(source: SourceRow): string | null {
  const value = parseConfig(source.config_json).root_path
  return typeof value === 'string' ? value : null
}

export function formatSources(
  sources: SourceRow[],
  opts: { readonly json: boolean; readonly format?: 'table' | 'compact' },
): string {
  if (opts.json) {
    // camelCase keys for consistency with status / search / auth JSON output.
    const rows = sources.map((source) => ({
      id: source.id,
      label: source.label,
      realmId: source.realm_id,
      realmSlug: source.realm_slug,
      adapterId: source.adapter_id,
      ref: sourceRef(source),
      rootPath: rootPath(source),
      configJson: source.config_json,
      ...(source.grant_id !== undefined ? { grantId: source.grant_id } : {}),
      createdAt: source.created_at,
      availability: source.availability,
      lastStatus: source.last_status ?? null,
      lastRunAt: source.last_run_at ?? null,
      errorsCount: source.errors_count ?? 0,
      itemsCount: source.items_count ?? 0,
      chunksCount: source.chunks_count ?? 0,
    }))
    return JSON.stringify(rows, null, 2)
  }
  if (sources.length === 0) return ''
  if (opts.format === 'compact') return sources.map(compactSource).join('\n')
  const table = new Table({
    head: [
      'Source',
      'Adapter',
      'Realm',
      'Ref',
      'Status',
      'Items',
      'Chunks',
      'Err',
      'Last run',
      'ID',
    ],
    colWidths: [18, 17, 12, 32, 24, 9, 9, 6, 18, 28],
    colAligns: [
      'left',
      'left',
      'left',
      'left',
      'left',
      'right',
      'right',
      'right',
      'left',
      'left',
    ],
    wordWrap: true,
    wrapOnWordBoundary: false,
    style: { head: [], border: [] },
  })
  for (const source of sources) {
    table.push([
      source.label,
      source.adapter_id,
      source.realm_slug ?? source.realm_id,
      sourceRef(source),
      displayStatus(source),
      String(source.items_count ?? 0),
      String(source.chunks_count ?? 0),
      String(source.errors_count ?? 0),
      lastRun(source),
      source.id,
    ])
  }
  return table.toString()
}
