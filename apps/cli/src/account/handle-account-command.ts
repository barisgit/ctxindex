import { authorizeProvider, resolveOAuthSelection } from '@ctxindex/core/auth'
import { resolveOAuthClient } from '@ctxindex/core/client'
import { accountUsage, parseAccountArgs } from '../args/account'
import { loadCliDefinitions } from '../definitions'
import { openAccountDeps, openDeps } from '../deps'
import {
  formatAccountAdded,
  formatAccountInventory,
  formatAccountRemoved,
} from '../format/account'
import { mapErrorToExit } from '../format/exit'

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
      const definitions = await loadCliDefinitions()
      resolveOAuthSelection(definitions.registry.adapters, parsed.provider)
      const opened = await openDeps({
        config: definitions.config,
        registry: definitions.registry,
      })
      deps = opened
      const result = await authorizeProvider(
        {
          provider: parsed.provider,
          mode: 'loopback',
          ...(parsed.label !== undefined ? { label: parsed.label } : {}),
          ...(parsed.client !== undefined ? { client: parsed.client } : {}),
        },
        {
          registry: opened.registry.adapters,
          authService: opened.authService,
          resolveClient: (input) =>
            resolveOAuthClient(input, {
              db: opened.db,
              store: opened.secretVault,
            }),
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
