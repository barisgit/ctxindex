import { SearchPlanner } from '@ctxindex/core/search'
import type { RpcSearchResult } from '@ctxindex/rpc'
import type { ResolvedSearchArgs } from '../args/search'
import { daemonSearch, selectDaemon } from '../daemon/client'
import { openDeps } from '../deps'
import { mapErrorToExit } from '../format/exit'
import {
  compactJson,
  formatPrettyCollection,
  formatTsv,
  type OutputColumn,
  type OutputEnvironment,
  type OutputFormat,
} from '../format/output'

type SearchResult =
  | Awaited<ReturnType<SearchPlanner['search']>>
  | RpcSearchResult

export function formatSearchJson(result: SearchResult): string {
  return compactJson(result)
}

const searchColumns = [
  { key: 'ref', label: 'Ref' },
  { key: 'profile', label: 'Profile' },
  { key: 'sourceId', label: 'Source' },
  { key: 'origin', label: 'Origin' },
  { key: 'originRank', label: 'Rank', align: 'right' },
  { key: 'title', label: 'Title' },
  { key: 'summary', label: 'Summary' },
  { key: 'occurredAt', label: 'Occurred at' },
  { key: 'chunks', label: 'Chunks' },
] satisfies readonly OutputColumn[]

function searchRows(result: SearchResult): readonly Record<string, unknown>[] {
  return result.results.map((item) => ({
    ...item,
    profile: compactJson(item.profile),
    title: item.title ?? 'null',
    summary: item.summary ?? 'null',
    occurredAt: item.occurredAt ?? 'null',
    chunks: compactJson(item.chunks),
  }))
}

export function formatSearchText(result: SearchResult): string {
  return formatTsv(searchColumns, searchRows(result))
}

export function formatSearchPretty(
  result: SearchResult,
  environment?: Pick<OutputEnvironment, 'columns'>,
): string {
  return formatPrettyCollection(searchColumns, searchRows(result), environment)
}

export interface SearchCommandDeps {
  readonly selectDaemon: typeof selectDaemon
  readonly search: typeof daemonSearch
  readonly open: typeof openDeps
}

const defaultDeps: SearchCommandDeps = {
  selectDaemon,
  search: daemonSearch,
  open: openDeps,
}

function printSearch(
  result: SearchResult,
  options: { format: OutputFormat; refs: boolean },
): void {
  if (options.format === 'json') console.log(formatSearchJson(result))
  else if (options.refs) {
    for (const item of result.results) console.log(item.ref)
  } else {
    const output =
      options.format === 'pretty'
        ? formatSearchPretty(result)
        : formatSearchText(result)
    if (output.length > 0) console.log(output)
  }
  if (options.format !== 'json') {
    for (const warning of result.warnings) {
      console.error(`${warning.sourceId}\t${warning.code}\t${warning.message}`)
    }
    if (result.explain) console.error(JSON.stringify(result.explain))
  }
}

export async function handleSearchCommand(
  parsed: ResolvedSearchArgs,
  services: SearchCommandDeps = defaultDeps,
): Promise<number> {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  process.once('SIGINT', cancel)
  let deps: Awaited<ReturnType<typeof openDeps>> | undefined
  try {
    const daemon = services.selectDaemon()
    let result: SearchResult
    if (daemon)
      result = await services.search(daemon, parsed.input, controller.signal)
    else {
      const directDeps = await services.open()
      deps = directDeps
      const sourceIds = parsed.input.sourceIds?.map((source) =>
        directDeps.sourceService.resolveSourceId(source),
      )
      result = await new SearchPlanner({
        db: directDeps.db,
        registry: directDeps.registry,
        authService: directDeps.authService,
        logger: directDeps.logger,
      }).search({
        ...parsed.input,
        ...(sourceIds ? { sourceIds } : {}),
        signal: controller.signal,
      })
    }
    printSearch(result, { format: parsed.format, refs: parsed.refs })
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  } finally {
    process.removeListener('SIGINT', cancel)
    await deps?.close()
  }
}
