import { readEnvironmentVariable } from '@ctxindex/core/config'
import { CtxindexValidationError } from '@ctxindex/core/errors'
import type { OAuthAppInventoryItem } from '@ctxindex/core/oauth-app'
import { assertInitialized } from '../commands/db'
import {
  daemonOAuthAppAdd,
  daemonOAuthAppList,
  daemonOAuthAppRegistration,
  daemonOAuthAppRemove,
  selectDaemon,
} from '../daemon/client'
import {
  ensureDaemonSelection,
  selectEnsuredDaemonRoute,
} from '../daemon/ensure'
import { loadCliDefinitions } from '../definitions'
import { openDeps } from '../deps'
import {
  acquireDirectDatabaseOwnership,
  type DirectDatabaseOwnership,
} from '../direct-database'
import { mapErrorToExit } from '../format/exit'
import {
  formatOAuthAppAdded,
  formatOAuthAppInventory,
  formatOAuthAppRemoved,
} from '../format/oauth-app'
import type { OutputFormat } from '../format/output'

export interface OAuthAppCommandDeps {
  readonly acquireOwnership: typeof acquireDirectDatabaseOwnership
  readonly loadDefinitions: typeof loadCliDefinitions
  readonly open: typeof openDeps
  readonly assertInitialized: typeof assertInitialized
  readonly readEnvironmentVariable: typeof readEnvironmentVariable
  readonly selectDaemon?: typeof selectDaemon
  readonly ensureDaemonSelection?: typeof ensureDaemonSelection
  readonly daemonOAuthAppRegistration?: typeof daemonOAuthAppRegistration
  readonly daemonOAuthAppAdd?: typeof daemonOAuthAppAdd
  readonly daemonOAuthAppList?: typeof daemonOAuthAppList
  readonly daemonOAuthAppRemove?: typeof daemonOAuthAppRemove
}

export type OAuthAppCommandInput =
  | { readonly kind: 'add'; readonly provider: string; readonly label: string }
  | { readonly kind: 'list'; readonly format: OutputFormat }
  | {
      readonly kind: 'remove'
      readonly provider: string
      readonly label: string
    }

const defaultDeps: OAuthAppCommandDeps = {
  acquireOwnership: acquireDirectDatabaseOwnership,
  loadDefinitions: loadCliDefinitions,
  open: openDeps,
  assertInitialized,
  readEnvironmentVariable,
  selectDaemon,
  ensureDaemonSelection,
  daemonOAuthAppRegistration,
  daemonOAuthAppAdd,
  daemonOAuthAppList,
  daemonOAuthAppRemove,
}

export async function handleOAuthAppCommand(
  parsed: OAuthAppCommandInput,
  services: OAuthAppCommandDeps = defaultDeps,
): Promise<number> {
  let deps: Awaited<ReturnType<typeof openDeps>> | undefined
  let ownership: DirectDatabaseOwnership | undefined
  const controller = new AbortController()
  const cancel = () => controller.abort()
  process.once('SIGINT', cancel)
  try {
    if (services.selectDaemon) {
      if (parsed.kind === 'add') {
        const definitions = await services.loadDefinitions()
        const provider = definitions.completeRegistry.providers.get(
          parsed.provider,
        )
        if (!provider || provider.auth.kind !== 'oauth2') {
          throw new CtxindexValidationError(
            'invalid_oauth_selection',
            `Unknown OAuth provider: ${parsed.provider}`,
          )
        }
      }
      await services.assertInitialized()
      const daemon = await selectEnsuredDaemonRoute(
        {
          selectDaemon: services.selectDaemon,
          ...(services.ensureDaemonSelection
            ? { ensureDaemonSelection: services.ensureDaemonSelection }
            : {}),
        },
        controller.signal,
      )
      if (daemon) {
        if (parsed.kind === 'add') {
          const registration = await (
            services.daemonOAuthAppRegistration ?? daemonOAuthAppRegistration
          )(daemon, parsed.provider, controller.signal)
          const config: Record<string, string> = {}
          for (const [field, name] of Object.entries(
            registration.environment,
          )) {
            const value = services.readEnvironmentVariable(name)
            if (value !== undefined) config[field] = value
          }
          await (services.daemonOAuthAppAdd ?? daemonOAuthAppAdd)(
            daemon,
            { provider: parsed.provider, label: parsed.label, config },
            controller.signal,
          )
          console.log(formatOAuthAppAdded(parsed.provider, parsed.label))
        } else if (parsed.kind === 'list') {
          const result = await (
            services.daemonOAuthAppList ?? daemonOAuthAppList
          )(daemon, controller.signal)
          const rows: OAuthAppInventoryItem[] = result.rows.map((row) => ({
            providerId: row.providerId,
            label: row.label,
            origin: row.origin,
            provenance:
              row.provenance.kind === 'local'
                ? { kind: 'local' }
                : {
                    kind: 'extension',
                    source: row.provenance.source,
                    ...(row.provenance.packageName === undefined
                      ? {}
                      : { packageName: row.provenance.packageName }),
                    ...(row.provenance.packageVersion === undefined
                      ? {}
                      : { packageVersion: row.provenance.packageVersion }),
                    ...(row.provenance.integrity === undefined
                      ? {}
                      : { integrity: row.provenance.integrity }),
                    ...(row.provenance.commit === undefined
                      ? {}
                      : { commit: row.provenance.commit }),
                  },
          }))
          console.log(formatOAuthAppInventory(rows, parsed.format))
        } else {
          await (services.daemonOAuthAppRemove ?? daemonOAuthAppRemove)(
            daemon,
            parsed.provider,
            parsed.label,
            controller.signal,
          )
          console.log(formatOAuthAppRemoved(parsed.provider, parsed.label))
        }
        return 0
      }
    }
    if (parsed.kind === 'add') {
      ownership = services.acquireOwnership()
      const definitions = await services.loadDefinitions({
        localOAuthAppIdentities: await ownership.readLocalOAuthAppIdentities(),
      })
      const provider = definitions.completeRegistry.providers.get(
        parsed.provider,
      )
      if (!provider || provider.auth.kind !== 'oauth2') {
        throw new CtxindexValidationError(
          'invalid_oauth_selection',
          `Unknown OAuth provider: ${parsed.provider}`,
        )
      }
      await services.assertInitialized()
      const config: Record<string, string> = {}
      for (const [field, name] of Object.entries(
        provider.auth.registration.environment,
      )) {
        if (typeof name !== 'string') continue
        const value = services.readEnvironmentVariable(name)
        if (value !== undefined) config[field] = value
      }
      const validated =
        provider.auth.registration.configSchema.safeParse(config)
      if (
        !validated.success ||
        validated.data === null ||
        typeof validated.data !== 'object' ||
        Array.isArray(validated.data)
      ) {
        throw new CtxindexValidationError(
          'invalid_filter',
          'OAuth App configuration is invalid for the selected Provider',
        )
      }
      deps = await services.open({
        definitions,
        databaseOwnership: ownership,
      })
      if (
        deps.oauthAppService
          .listApps()
          .some(
            (app) =>
              app.providerId === parsed.provider && app.label === parsed.label,
          )
      ) {
        throw new CtxindexValidationError(
          'invalid_filter',
          `OAuth App label "${parsed.label}" is already taken for Provider "${parsed.provider}"`,
        )
      }
      await deps.oauthAppService.addLocalApp({
        providerId: parsed.provider,
        label: parsed.label,
        config,
      })
      console.log(formatOAuthAppAdded(parsed.provider, parsed.label))
    } else {
      await services.assertInitialized()
      deps = await services.open()
      if (parsed.kind === 'list') {
        console.log(
          formatOAuthAppInventory(
            deps.oauthAppService.listApps(),
            parsed.format,
          ),
        )
      } else {
        await deps.oauthAppService.removeLocalApp(parsed.provider, parsed.label)
        console.log(formatOAuthAppRemoved(parsed.provider, parsed.label))
      }
    }
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  } finally {
    process.removeListener('SIGINT', cancel)
    await deps?.close()
    ownership?.close()
  }
}
