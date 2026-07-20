import { CtxindexValidationError } from '@ctxindex/core/errors'
import { describeRegistry } from '@ctxindex/core/registry'
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
    const deps = await openDeps({ config: definitions.config })
    const active = parseSourceArgs(
      args,
      describeRegistry(deps.registry).sources,
    )
    if (active.kind === 'unknown') {
      console.error(`${active.message}. Try: ${sourceUsage}`)
      return 2
    }
    if (active.kind === 'help') return 0
    if (active.kind === 'add') {
      const adapter = deps.registry.adapters.get({ id: active.adapterId })
      if (!adapter)
        throw new CtxindexValidationError(
          'invalid_filter',
          `Unknown adapter: ${active.adapterId}`,
        )
      let config: unknown
      try {
        config = JSON.parse(active.configJson ?? '{}')
      } catch {
        throw new CtxindexValidationError(
          'invalid_filter',
          `invalid config for Adapter ${adapter.id}`,
        )
      }
      const validatedConfig = adapter.configSchema.safeParse(config)
      if (!validatedConfig.success)
        throw new CtxindexValidationError(
          'invalid_filter',
          `invalid config for Adapter ${adapter.id}`,
        )
      const grantId = await resolveSourceGrant(
        deps.authService,
        adapter,
        active.account,
      )
      const { sourceId } = deps.sourceService.addSource({
        adapterId: active.adapterId,
        ...(active.realmSlug ? { realmSlug: active.realmSlug } : {}),
        ...(active.label ? { label: active.label } : {}),
        configJson: JSON.stringify(validatedConfig.data),
        ...(grantId ? { grantId } : {}),
        ...(active.searchRouting
          ? { searchRouting: active.searchRouting }
          : {}),
        ...(active.syncEnabled !== undefined
          ? { syncEnabled: active.syncEnabled }
          : {}),
      })
      console.log(formatSourceAdded(sourceId))
    } else if (active.kind === 'list') {
      const output = formatSources(
        deps.sourceService.listSources(active),
        active,
      )
      if (output.length > 0) console.log(output)
    } else {
      const sourceId = deps.sourceService.resolveSourceId(active.sourceId)
      deps.sourceService.removeSource(sourceId)
      console.log(formatSourceRemoved(sourceId))
    }
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  }
}
