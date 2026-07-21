import {
  authorizeProvider,
  launchOAuthBrowser,
  resolveOAuthSelection,
} from '@ctxindex/core/auth'
import { readEnvironmentVariable } from '@ctxindex/core/config'
import { CtxindexValidationError } from '@ctxindex/core/errors'
import {
  type ManagedOAuthAppPolicy,
  type ManagedOAuthAppResolution,
  type OAuthAppInventoryItem,
  resolveManagedOAuthApp,
} from '@ctxindex/core/oauth-app'
import type { CompleteRegistry } from '@ctxindex/core/registry'
import { CTXINDEX_MANAGED_OAUTH_APP_POLICIES } from '@ctxindex/official'
import { assertInitialized } from '../commands/db'
import {
  daemonAccountAdd,
  daemonAccountList,
  daemonAccountRemove,
  selectDaemon,
} from '../daemon/client'
import {
  ensureDaemonSelection,
  selectEnsuredDaemonRoute,
} from '../daemon/ensure'
import { loadAuthDefinitionDeps, openAccountDeps, openDeps } from '../deps'
import {
  formatAccountAdded,
  formatAccountInventory,
  formatAccountRemoved,
} from '../format/account'
import { mapErrorToExit } from '../format/exit'
import type { OutputFormat } from '../format/output'
import { readHiddenOAuthResponse } from './read-hidden-oauth-response'

export interface AccountCommandRuntime {
  readonly assertInitialized: typeof assertInitialized
  readonly loadAuthDefinitionDeps: typeof loadAuthDefinitionDeps
  readonly openAccountDeps: typeof openAccountDeps
  readonly openDeps: typeof openDeps
  readonly authorizeProvider: typeof authorizeProvider
  readonly selectDaemon?: typeof selectDaemon
  readonly ensureDaemonSelection?: typeof ensureDaemonSelection
  readonly daemonAccountAdd?: typeof daemonAccountAdd
  readonly daemonAccountList?: typeof daemonAccountList
  readonly daemonAccountRemove?: typeof daemonAccountRemove
  readonly launchOAuthBrowser: typeof launchOAuthBrowser
  readonly readEnvironmentVariable: typeof readEnvironmentVariable
}

export type AccountCommandInput =
  | {
      readonly kind: 'add'
      readonly provider: string
      readonly label?: string
      readonly app?: string
    }
  | { readonly kind: 'list'; readonly format: OutputFormat }
  | { readonly kind: 'remove'; readonly label: string }

const accountCommandRuntime: AccountCommandRuntime = {
  assertInitialized,
  loadAuthDefinitionDeps,
  openAccountDeps,
  openDeps,
  authorizeProvider,
  selectDaemon,
  ensureDaemonSelection,
  daemonAccountAdd,
  daemonAccountList,
  daemonAccountRemove,
  launchOAuthBrowser,
  readEnvironmentVariable,
}

function availableOAuthAppLabels(
  inventory: readonly OAuthAppInventoryItem[],
  providerId: string,
): string[] {
  return inventory
    .filter((app) => app.providerId === providerId)
    .map((app) => app.label)
    .sort()
}

function localOAuthAppGuidance(providerId: string, label: string): string {
  return [
    `Configure a local OAuth App with: bun cli oauth-app add ${providerId} ${label} --from-env`,
    `Then authorize with: bun cli account add ${providerId} --app ${label}`,
  ].join('. ')
}

export function formatAccountCommandError(
  error: unknown,
  managedProviderId?: string,
): string {
  const message = error instanceof Error ? error.message : String(error)
  return managedProviderId === undefined
    ? message
    : `${message}\n${localOAuthAppGuidance(managedProviderId, '<label>')}`
}

export function resolveAccountOAuthAppLabel(
  registry: CompleteRegistry,
  providerId: string,
  explicitLabel?: string,
  managed: {
    readonly policies: readonly ManagedOAuthAppPolicy[]
    readonly resolve: (
      registry: CompleteRegistry,
      policies: readonly ManagedOAuthAppPolicy[],
      providerId: string,
    ) => ManagedOAuthAppResolution
  } = {
    policies: CTXINDEX_MANAGED_OAUTH_APP_POLICIES,
    resolve: resolveManagedOAuthApp,
  },
): string {
  if (explicitLabel !== undefined) return explicitLabel

  const resolution = managed.resolve(registry, managed.policies, providerId)
  if (resolution.status === 'selected') return resolution.label

  throw new CtxindexValidationError(
    'invalid_oauth_selection',
    `No managed OAuth App is available for Provider "${providerId}". ${localOAuthAppGuidance(providerId, '<label>')}`,
  )
}

export async function handleAccountCommand(
  parsed: AccountCommandInput,
  runtime: AccountCommandRuntime = accountCommandRuntime,
): Promise<number> {
  let deps:
    | Awaited<ReturnType<typeof openDeps>>
    | Awaited<ReturnType<typeof openAccountDeps>>
    | undefined
  let managedProviderId: string | undefined
  const controller = new AbortController()
  const cancel = () => controller.abort()
  process.once('SIGINT', cancel)
  try {
    if (parsed.kind === 'add') {
      try {
        await runtime.assertInitialized()
      } catch (initializationError) {
        const definitions = await runtime.loadAuthDefinitionDeps()
        resolveOAuthSelection(definitions.completeRegistry, parsed.provider)
        throw initializationError
      }
    } else {
      await runtime.assertInitialized()
    }
    const daemon = runtime.selectDaemon
      ? await selectEnsuredDaemonRoute(
          {
            selectDaemon: runtime.selectDaemon,
            ...(runtime.ensureDaemonSelection
              ? { ensureDaemonSelection: runtime.ensureDaemonSelection }
              : {}),
          },
          controller.signal,
        )
      : null
    if (daemon) {
      if (parsed.kind === 'list') {
        const result = await (runtime.daemonAccountList ?? daemonAccountList)(
          daemon,
          controller.signal,
        )
        console.log(formatAccountInventory(result.rows, parsed.format))
      } else if (parsed.kind === 'remove') {
        await (runtime.daemonAccountRemove ?? daemonAccountRemove)(
          daemon,
          parsed.label,
          controller.signal,
        )
        console.log(formatAccountRemoved(parsed.label))
      } else {
        const timeout = Number(
          runtime.readEnvironmentVariable('CTXINDEX_LOOPBACK_TIMEOUT_SECS'),
        )
        const noBrowser =
          runtime.readEnvironmentVariable('CTXINDEX_NO_BROWSER') === '1'
        const oauthMockBaseUrl = runtime.readEnvironmentVariable(
          'CTXINDEX_OAUTH_MOCK_BASE_URL',
        )
        const result = await (runtime.daemonAccountAdd ?? daemonAccountAdd)(
          daemon,
          {
            provider: parsed.provider,
            ...(parsed.app === undefined ? {} : { app: parsed.app }),
            ...(parsed.label === undefined ? {} : { label: parsed.label }),
            ...(Number.isFinite(timeout) && timeout >= 0 && timeout <= 3_600
              ? { loopbackTimeoutSeconds: timeout }
              : {}),
            ...(oauthMockBaseUrl ? { oauthMockBaseUrl } : {}),
          },
          {
            emitAuthorizationUrl: async (url) => {
              console.log(`Open this URL: ${url}`)
              if (!noBrowser) {
                try {
                  await runtime.launchOAuthBrowser(url)
                } catch {}
              }
            },
            readAuthorizationResponse: (input) =>
              readHiddenOAuthResponse({ ...input, onCancel: cancel }),
          },
          controller.signal,
        )
        console.log(formatAccountAdded(result))
      }
      return 0
    }
    if (parsed.kind === 'list') {
      deps = await runtime.openAccountDeps()
      console.log(
        formatAccountInventory(
          deps.accountService.listAccountInventory(),
          parsed.format,
        ),
      )
    } else if (parsed.kind === 'remove') {
      deps = await runtime.openDeps()
      await deps.authService.removeAccount(parsed.label)
      console.log(formatAccountRemoved(parsed.label))
    } else {
      const opened = await runtime.openDeps()
      deps = opened
      resolveOAuthSelection(opened.completeRegistry, parsed.provider)
      const appLabel = resolveAccountOAuthAppLabel(
        opened.completeRegistry,
        parsed.provider,
        parsed.app,
      )
      if (parsed.app === undefined) managedProviderId = parsed.provider
      let app: Awaited<ReturnType<typeof opened.oauthAppService.resolveApp>>
      try {
        app = await opened.oauthAppService.resolveApp(parsed.provider, appLabel)
      } catch (error) {
        if (
          error instanceof CtxindexValidationError &&
          error.code === 'invalid_oauth_selection'
        ) {
          const availableApps = availableOAuthAppLabels(
            opened.oauthAppService.listApps(),
            parsed.provider,
          )
          const guidance =
            availableApps.length === 0
              ? localOAuthAppGuidance(parsed.provider, appLabel)
              : `Available labels: ${availableApps.join(', ')}`
          managedProviderId = undefined
          throw new CtxindexValidationError(
            'invalid_oauth_selection',
            `OAuth App "${appLabel}" is not available for Provider "${parsed.provider}". ${guidance}`,
            { cause: error },
          )
        }
        throw error
      }
      // BYOA guidance is selection fallback, not a suffix for Provider errors.
      managedProviderId = undefined
      const result = await runtime.authorizeProvider(
        {
          provider: parsed.provider,
          app: appLabel,
          mode: 'loopback',
          ...(parsed.label !== undefined ? { label: parsed.label } : {}),
        },
        {
          registry: opened.completeRegistry,
          authService: opened.authService,
          resolveApp: async (providerId, label) => {
            if (providerId !== parsed.provider || label !== appLabel) {
              throw new CtxindexValidationError(
                'invalid_oauth_selection',
                'OAuth App selection changed during authorization',
              )
            }
            return app
          },
          emitAuthorizationUrl: (url) => console.log(`Open this URL: ${url}`),
          readAuthorizationResponse: (input) =>
            readHiddenOAuthResponse({ ...input, onCancel: cancel }),
        },
      )
      console.log(formatAccountAdded(result))
    }
    return 0
  } catch (error) {
    console.error(formatAccountCommandError(error, managedProviderId))
    return mapErrorToExit(error)
  } finally {
    process.removeListener('SIGINT', cancel)
    await deps?.close()
  }
}
