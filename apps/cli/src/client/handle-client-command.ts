import { readEnvironmentVariable } from '@ctxindex/core/config'
import { CtxindexValidationError } from '@ctxindex/core/errors'
import { clientUsage, parseClientArgs } from '../args/client'
import { loadCliDefinitions } from '../definitions'
import { openDeps } from '../deps'
import {
  formatClientAdded,
  formatClientInventory,
  formatClientRemoved,
} from '../format/client'
import { mapErrorToExit } from '../format/exit'

export async function handleClientCommand(args: string[]): Promise<number> {
  const parsed = parseClientArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${clientUsage}`)
    return 2
  }

  let deps: Awaited<ReturnType<typeof openDeps>> | undefined
  try {
    if (parsed.kind === 'add') {
      const definitions = await loadCliDefinitions()
      const provider = definitions.registry.adapters.getOAuthProvider(
        parsed.provider,
      )
      if (!provider) {
        throw new CtxindexValidationError(
          'invalid_filter',
          `Unknown OAuth provider: ${parsed.provider}`,
        )
      }
      const clientId = readEnvironmentVariable(provider.environment.clientId)
      if (!clientId) {
        throw new CtxindexValidationError(
          'invalid_filter',
          `OAuth client id environment value is unavailable: ${provider.environment.clientId}`,
        )
      }
      const clientSecretName = provider.environment.clientSecret
      const clientSecret = clientSecretName
        ? readEnvironmentVariable(clientSecretName)
        : undefined
      if (provider.client.secret === 'required' && !clientSecret) {
        throw new CtxindexValidationError(
          'invalid_filter',
          `OAuth client secret environment value is unavailable: ${clientSecretName}`,
        )
      }
      deps = await openDeps({
        config: definitions.config,
        registry: definitions.registry,
      })
      const added = await deps.oauthClientService.addClient({
        provider: provider.id,
        ...(parsed.label !== undefined ? { label: parsed.label } : {}),
        clientId,
        ...(clientSecret ? { clientSecret } : {}),
      })
      console.log(formatClientAdded(added))
    } else {
      deps = await openDeps()
      if (parsed.kind === 'list') {
        console.log(
          formatClientInventory(deps.oauthClientService.listClients()),
        )
      } else {
        await deps.oauthClientService.removeClient(
          parsed.provider,
          parsed.label,
        )
        console.log(formatClientRemoved(parsed.provider, parsed.label))
      }
    }
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  } finally {
    await deps?.close()
  }
}
