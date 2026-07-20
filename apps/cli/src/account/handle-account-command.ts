import { CTXINDEX_MANAGED_OAUTH_APP_POLICIES } from '@ctxindex/adapters'
import { authorizeProvider, resolveOAuthSelection } from '@ctxindex/core/auth'
import { CtxindexValidationError } from '@ctxindex/core/errors'
import {
  type ManagedOAuthAppPolicy,
  type ManagedOAuthAppResolution,
  type OAuthAppInventoryItem,
  resolveManagedOAuthApp,
} from '@ctxindex/core/oauth-app'
import type { CompleteRegistry } from '@ctxindex/core/registry'
import { accountUsage, parseAccountArgs } from '../args/account'
import { assertInitialized } from '../commands/db'
import { loadAuthDefinitionDeps, openAccountDeps, openDeps } from '../deps'
import {
  formatAccountAdded,
  formatAccountInventory,
  formatAccountRemoved,
} from '../format/account'
import { mapErrorToExit } from '../format/exit'

export interface AccountCommandRuntime {
  readonly assertInitialized: typeof assertInitialized
  readonly loadAuthDefinitionDeps: typeof loadAuthDefinitionDeps
  readonly openAccountDeps: typeof openAccountDeps
  readonly openDeps: typeof openDeps
  readonly authorizeProvider: typeof authorizeProvider
}

const accountCommandRuntime: AccountCommandRuntime = {
  assertInitialized,
  loadAuthDefinitionDeps,
  openAccountDeps,
  openDeps,
  authorizeProvider,
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
  args: string[],
  runtime: AccountCommandRuntime = accountCommandRuntime,
): Promise<number> {
  const parsed = parseAccountArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${accountUsage}`)
    return 2
  }

  let deps:
    | Awaited<ReturnType<typeof openDeps>>
    | Awaited<ReturnType<typeof openAccountDeps>>
    | undefined
  let managedProviderId: string | undefined
  try {
    if (parsed.kind === 'list') {
      deps = await runtime.openAccountDeps()
      console.log(
        formatAccountInventory(
          deps.accountService.listAccountInventory(),
          parsed.json,
        ),
      )
    } else if (parsed.kind === 'remove') {
      deps = await runtime.openDeps()
      await deps.authService.removeAccount(parsed.label)
      console.log(formatAccountRemoved(parsed.label))
    } else {
      try {
        await runtime.assertInitialized()
      } catch (initializationError) {
        const definitions = await runtime.loadAuthDefinitionDeps()
        resolveOAuthSelection(definitions.completeRegistry, parsed.provider)
        throw initializationError
      }
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
          resolveApp: async () => app,
          emitAuthorizationUrl: (url) => console.log(`Open this URL: ${url}`),
        },
      )
      console.log(formatAccountAdded(result))
    }
    return 0
  } catch (error) {
    console.error(formatAccountCommandError(error, managedProviderId))
    return mapErrorToExit(error)
  } finally {
    await deps?.close()
  }
}
