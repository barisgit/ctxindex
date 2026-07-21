import { SearchPlanner } from '@ctxindex/core/search'
import type { RpcSearchResult } from '@ctxindex/rpc'
import type { ResolvedSearchArgs } from '../args/search'
import { daemonSearch, selectDaemon } from '../daemon/client'
import { openDeps } from '../deps'
import { mapErrorToExit } from '../format/exit'

type SearchResult =
  | Awaited<ReturnType<SearchPlanner['search']>>
  | RpcSearchResult

export function formatSearchJson(result: SearchResult): string {
  return JSON.stringify(result)
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
  options: { json: boolean; refs: boolean },
): void {
  if (options.json) console.log(formatSearchJson(result))
  else if (options.refs) {
    for (const item of result.results) console.log(item.ref)
  } else {
    for (const item of result.results) {
      console.log(`${item.ref}${item.title ? `\t${item.title}` : ''}`)
    }
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
    printSearch(result, { json: parsed.json, refs: parsed.refs })
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  } finally {
    process.removeListener('SIGINT', cancel)
    await deps?.close()
  }
}
