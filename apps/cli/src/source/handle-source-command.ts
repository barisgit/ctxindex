import { CtxindexValidationError } from '@ctxindex/core/errors'
import {
  resolveSourceAddArgs,
  type SourceAddCommandArgs,
  type SourceArgumentDescription,
  type SourceListCommandArgs,
  type SourceRemoveCommandArgs,
} from '../args/source'
import {
  type DaemonSelection,
  daemonSourceAdd,
  daemonSourceDefinitions,
  daemonSourceList,
  daemonSourceRemove,
  selectDaemon,
} from '../daemon/client'
import { loadCliDefinitions } from '../definitions'
import { openDeps } from '../deps'
import {
  acquireDirectDatabaseOwnership,
  type DirectDatabaseOwnership,
} from '../direct-database'
import { mapErrorToExit } from '../format/exit'
import type { OutputFormat } from '../format/output'
import {
  formatSourceAdded,
  formatSourceRemoved,
  formatSources,
} from '../format/source'
import { resolveSourceGrant } from './resolve-source-grant'

export interface SourceCommandDeps {
  readonly selectDaemon: typeof selectDaemon
  readonly sourceDefinitions: typeof daemonSourceDefinitions
  readonly sourceAdd: typeof daemonSourceAdd
  readonly sourceList: typeof daemonSourceList
  readonly sourceRemove: typeof daemonSourceRemove
  readonly acquireOwnership?: typeof acquireDirectDatabaseOwnership
  readonly loadDefinitions: typeof loadCliDefinitions
  readonly open: typeof openDeps
}

const defaultDeps: SourceCommandDeps = {
  selectDaemon,
  sourceDefinitions: daemonSourceDefinitions,
  sourceAdd: daemonSourceAdd,
  sourceList: daemonSourceList,
  sourceRemove: daemonSourceRemove,
  acquireOwnership: acquireDirectDatabaseOwnership,
  loadDefinitions: loadCliDefinitions,
  open: openDeps,
}

type LoadedDefinitions = Awaited<ReturnType<typeof loadCliDefinitions>>

export type SourceCommandRoute =
  | {
      readonly kind: 'daemon'
      readonly selection: DaemonSelection
      readonly definitions?: Awaited<ReturnType<typeof daemonSourceDefinitions>>
    }
  | {
      readonly kind: 'direct'
      readonly ownership: DirectDatabaseOwnership
      readonly definitions?: LoadedDefinitions
    }

export const defaultSourceCommandDeps = defaultDeps

const closedDirectRoutes = new WeakSet<object>()

export function closeSourceCommandRoute(route: SourceCommandRoute): void {
  if (route.kind !== 'direct' || closedDirectRoutes.has(route)) return
  closedDirectRoutes.add(route)
  route.ownership.close()
}

export interface RetainedSourceCommandRoute {
  resolve(): Promise<SourceCommandRoute>
  close(): Promise<void>
  error(): unknown
}

export function retainSourceCommandRoute(
  needsDefinitions: boolean,
  services: SourceCommandDeps = defaultDeps,
): RetainedSourceCommandRoute {
  let retained: Promise<SourceCommandRoute> | undefined
  let routeError: unknown
  let closed = false
  const resolve = (): Promise<SourceCommandRoute> => {
    retained ??= resolveSourceCommandRoute(needsDefinitions, services).catch(
      (error: unknown) => {
        routeError = error
        throw error
      },
    )
    return retained
  }
  return {
    resolve,
    async close() {
      if (closed || !retained) return
      closed = true
      try {
        closeSourceCommandRoute(await retained)
      } catch {
        // Route resolution owns rollback for partial acquisition.
      }
    },
    error: () => routeError,
  }
}

export function sourceRouteDescriptions(
  route: SourceCommandRoute,
): readonly SourceArgumentDescription[] {
  if (route.kind === 'daemon') return route.definitions?.rows ?? []
  return route.definitions?.description.sources ?? []
}

export async function sourceHelpDescriptions(
  services: SourceCommandDeps = defaultDeps,
): Promise<readonly SourceArgumentDescription[]> {
  const selection = services.selectDaemon()
  if (selection) return (await services.sourceDefinitions(selection)).rows
  return (await services.loadDefinitions()).description.sources
}

export async function resolveSourceCommandRoute(
  needsDefinitions: boolean,
  services: SourceCommandDeps = defaultDeps,
): Promise<SourceCommandRoute> {
  const selection = services.selectDaemon()
  if (selection) {
    return needsDefinitions
      ? {
          kind: 'daemon',
          selection,
          definitions: await services.sourceDefinitions(selection),
        }
      : { kind: 'daemon', selection }
  }
  const ownership = (
    services.acquireOwnership ?? acquireDirectDatabaseOwnership
  )()
  if (!needsDefinitions) return { kind: 'direct', ownership }
  try {
    const localOAuthAppIdentities =
      await ownership.readLocalOAuthAppIdentities()
    return {
      kind: 'direct',
      ownership,
      definitions: await services.loadDefinitions({
        localOAuthAppIdentities,
      }),
    }
  } catch (error) {
    ownership.close()
    throw error
  }
}

export type SourceCommandInput =
  | { readonly kind: 'add'; readonly args: SourceAddCommandArgs }
  | {
      readonly kind: 'list'
      readonly args: SourceListCommandArgs
      readonly format: OutputFormat
    }
  | { readonly kind: 'remove'; readonly args: SourceRemoveCommandArgs }

export async function handleSourceCommand(
  input: SourceCommandInput,
  retainedRoute: SourceCommandRoute,
  services: SourceCommandDeps = defaultDeps,
): Promise<number> {
  let deps: Awaited<ReturnType<typeof openDeps>> | undefined
  let directOwnership: DirectDatabaseOwnership | undefined
  let directRoute: Extract<SourceCommandRoute, { kind: 'direct' }> | undefined
  const controller = new AbortController()
  const cancel = () => controller.abort()
  process.once('SIGINT', cancel)
  try {
    const route = retainedRoute
    if (route.kind === 'direct') directRoute = route
    const definitions = route.kind === 'direct' ? route.definitions : undefined
    const parsed =
      input.kind === 'add'
        ? {
            kind: 'add' as const,
            ...resolveSourceAddArgs(input.args, sourceRouteDescriptions(route)),
          }
        : input.kind === 'list'
          ? {
              kind: 'list' as const,
              ...(input.args.realm === undefined
                ? {}
                : { realmSlug: input.args.realm }),
              format: input.format,
            }
          : { kind: 'remove' as const, sourceId: input.args.source }
    if (route.kind === 'daemon') {
      if (parsed.kind === 'add') {
        const result = await services.sourceAdd(
          route.selection,
          {
            adapterId: parsed.adapterId,
            ...(parsed.realmSlug ? { realmSlug: parsed.realmSlug } : {}),
            ...(parsed.label ? { label: parsed.label } : {}),
            ...(parsed.configJson ? { configJson: parsed.configJson } : {}),
            ...(parsed.account ? { account: parsed.account } : {}),
            ...(parsed.searchRouting
              ? { searchRouting: parsed.searchRouting }
              : {}),
            ...(parsed.syncEnabled !== undefined
              ? { syncEnabled: parsed.syncEnabled }
              : {}),
          },
          controller.signal,
        )
        console.log(formatSourceAdded(result.sourceId))
      } else if (parsed.kind === 'list') {
        const result = await services.sourceList(
          route.selection,
          parsed.realmSlug ? { realmSlug: parsed.realmSlug } : {},
          controller.signal,
        )
        const output = formatSources(result.rows, parsed.format)
        if (output.length > 0) console.log(output)
      } else {
        const result = await services.sourceRemove(
          route.selection,
          parsed.sourceId,
          controller.signal,
        )
        console.log(formatSourceRemoved(result.sourceId))
      }
      return 0
    }
    directOwnership = route.ownership
    const directDefinitions =
      definitions ??
      (await services.loadDefinitions({
        localOAuthAppIdentities:
          await directOwnership.readLocalOAuthAppIdentities(),
      }))
    deps = await services.open({
      definitions: directDefinitions,
      databaseOwnership: directOwnership,
    })
    const active = parsed
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
        active.format,
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
  } finally {
    process.removeListener('SIGINT', cancel)
    try {
      await deps?.close()
    } catch {
      // Cleanup cannot replace the command result or failure.
    }
    if (directRoute) {
      try {
        closeSourceCommandRoute(directRoute)
      } catch {
        // Release is independent from dependency cleanup and command outcome.
      }
    }
  }
}
