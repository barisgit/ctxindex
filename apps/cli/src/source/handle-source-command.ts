import { CtxindexValidationError } from '@ctxindex/core/errors'
import { parseSourceArgs, sourceUsage } from '../args/source'
import { loadCliDefinitions } from '../definitions'
import { openDeps } from '../deps'
import { mapErrorToExit } from '../format/exit'
import {
  formatSourceAdded,
  formatSourceRemoved,
  formatSources,
} from '../format/source'
import { resolveSourceGrant } from './resolve-source-grant'

export async function handleSourceCommand(args: string[]): Promise<number> {
  try {
    const definitions = await loadCliDefinitions()
    const parsed = parseSourceArgs(args, definitions.description.sources)
    if (parsed.kind === 'help') return 0
    if (parsed.kind === 'unknown') {
      console.error(`${parsed.message}. Try: ${sourceUsage}`)
      return 2
    }
    const deps = await openDeps({
      config: definitions.config,
      registry: definitions.registry,
    })
    if (parsed.kind === 'add') {
      const adapter = deps.registry.adapters
        .list()
        .filter((candidate) => candidate.id === parsed.adapterId)
        .sort((left, right) => right.version - left.version)[0]
      if (!adapter)
        throw new CtxindexValidationError(
          'invalid_filter',
          `Unknown adapter: ${parsed.adapterId}`,
        )
      let config: unknown
      try {
        config = JSON.parse(parsed.configJson ?? '{}')
      } catch {
        throw new CtxindexValidationError(
          'invalid_filter',
          `invalid config for Adapter ${adapter.id}@${adapter.version}`,
        )
      }
      const validatedConfig = adapter.configSchema.safeParse(config)
      if (!validatedConfig.success)
        throw new CtxindexValidationError(
          'invalid_filter',
          `invalid config for Adapter ${adapter.id}@${adapter.version}`,
        )
      const grantId = await resolveSourceGrant(
        deps.authService,
        adapter.auth,
        parsed.account,
      )
      const { sourceId } = deps.sourceService.addSource({
        adapterId: parsed.adapterId,
        adapterVersion: adapter.version,
        ...(parsed.realmSlug ? { realmSlug: parsed.realmSlug } : {}),
        ...(parsed.label ? { label: parsed.label } : {}),
        configJson: JSON.stringify(validatedConfig.data),
        ...(grantId ? { grantId } : {}),
        ...(parsed.searchRouting
          ? { searchRouting: parsed.searchRouting }
          : {}),
      })
      console.log(formatSourceAdded(sourceId))
    } else if (parsed.kind === 'list') {
      const output = formatSources(
        deps.sourceService.listSources(parsed),
        parsed,
      )
      if (output.length > 0) console.log(output)
    } else {
      const sourceId = deps.sourceService.resolveSourceId(parsed.sourceId)
      deps.sourceService.removeSource(sourceId)
      console.log(formatSourceRemoved(sourceId))
    }
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  }
}
