import { dirname } from 'node:path'
import type { SourceRow } from '@ctxindex/core/source'
import type { RpcSourceRow } from '@ctxindex/rpc'
import {
  compactJson,
  formatPrettyCollection,
  formatTsv,
  type OutputColumn,
  type OutputFormat,
} from './output'

export function formatSourceAdded(sourceId: string): string {
  return `source added: ${sourceId}`
}

type FormattableSource = SourceRow | RpcSourceRow

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

function sourceRef(source: FormattableSource): string {
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

function rootPath(source: FormattableSource): string | null {
  const value = parseConfig(source.config_json).root_path
  return typeof value === 'string' ? value : null
}

export function formatSources(
  sources: readonly FormattableSource[],
  format: OutputFormat,
): string {
  const rows = sources.map((source) => ({
    id: source.id,
    label: source.label,
    realmId: source.realm_id,
    realmSlug: source.realm_slug,
    adapterId: source.adapter_id,
    ref: sourceRef(source),
    rootPath: rootPath(source),
    configJson: source.config_json,
    syncEnabled: source.sync_enabled,
    createdAt: source.created_at,
    availability: source.availability,
    lastStatus: source.last_status ?? null,
    lastRunAt: source.last_run_at ?? null,
    warningsCount: source.warnings_count ?? 0,
    lastWarning: source.last_warning ?? null,
    errorsCount: source.errors_count ?? 0,
    lastError: source.last_error ?? null,
    itemsCount: source.items_count ?? 0,
    chunksCount: source.chunks_count ?? 0,
  }))
  if (format === 'json') return compactJson(rows)
  const columns = [
    { key: 'label', label: 'Source' },
    { key: 'adapterId', label: 'Adapter' },
    { key: 'realmSlug', label: 'Realm' },
    { key: 'ref', label: 'Ref' },
    { key: 'availability', label: 'Availability' },
    { key: 'lastStatus', label: 'Status' },
    { key: 'itemsCount', label: 'Items', align: 'right' },
    { key: 'chunksCount', label: 'Chunks', align: 'right' },
    { key: 'warningsCount', label: 'Warnings', align: 'right' },
    { key: 'lastWarning', label: 'Last warning' },
    { key: 'errorsCount', label: 'Errors', align: 'right' },
    { key: 'lastError', label: 'Last error' },
    { key: 'lastRunAt', label: 'Last run' },
    { key: 'id', label: 'ID' },
  ] satisfies readonly OutputColumn[]
  return format === 'pretty'
    ? formatPrettyCollection(columns, rows)
    : formatTsv(columns, rows)
}
