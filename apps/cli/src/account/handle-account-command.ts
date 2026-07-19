import { authorizeProvider, resolveOAuthSelection } from '@ctxindex/core/auth'
import { CtxindexValidationError } from '@ctxindex/core/errors'
import type { OAuthAppInventoryItem } from '@ctxindex/core/oauth-app'
import { accountUsage, parseAccountArgs } from '../args/account'
import { assertInitialized } from '../commands/db'
import { loadAuthDefinitionDeps, openAccountDeps, openDeps } from '../deps'
import {
  formatAccountAdded,
  formatAccountInventory,
  formatAccountRemoved,
} from '../format/account'
import { mapErrorToExit } from '../format/exit'

function availableOAuthAppLabels(
  inventory: readonly OAuthAppInventoryItem[],
  providerId: string,
): string[] {
  return inventory
    .filter((app) => app.providerId === providerId)
    .map((app) => app.label)
    .sort()
}

export async function handleAccountCommand(args: string[]): Promise<number> {
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
  try {
    if (parsed.kind === 'list') {
      deps = await openAccountDeps()
      console.log(
        formatAccountInventory(
          deps.accountService.listAccountInventory(),
          parsed.json,
        ),
      )
    } else if (parsed.kind === 'remove') {
      deps = await openDeps()
      await deps.authService.removeAccount(parsed.label)
      console.log(formatAccountRemoved(parsed.label))
    } else {
      try {
        await assertInitialized()
      } catch (initializationError) {
        const definitions = await loadAuthDefinitionDeps()
        resolveOAuthSelection(definitions.completeRegistry, parsed.provider)
        throw initializationError
      }
      const opened = await openDeps()
      deps = opened
      resolveOAuthSelection(opened.completeRegistry, parsed.provider)
      const availableApps = availableOAuthAppLabels(
        opened.oauthAppService.listApps(),
        parsed.provider,
      )
      if (!availableApps.includes(parsed.app)) {
        const guidance =
          availableApps.length === 0
            ? `Add it with: bun cli oauth-app add ${parsed.provider} ${parsed.app} --from-env`
            : `Available labels: ${availableApps.join(', ')}`
        throw new CtxindexValidationError(
          'invalid_oauth_selection',
          `OAuth App "${parsed.app}" is not available for Provider "${parsed.provider}". ${guidance}`,
        )
      }
      const result = await authorizeProvider(
        {
          provider: parsed.provider,
          app: parsed.app,
          mode: 'loopback',
          ...(parsed.label !== undefined ? { label: parsed.label } : {}),
        },
        {
          registry: opened.completeRegistry,
          authService: opened.authService,
          resolveApp: (providerId, label) =>
            opened.oauthAppService.resolveApp(providerId, label),
          emitAuthorizationUrl: (url) => console.log(`Open this URL: ${url}`),
        },
      )
      console.log(formatAccountAdded(result))
    }
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  } finally {
    await deps?.close()
  }
}
