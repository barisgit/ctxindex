import { readEnvironmentVariable } from '@ctxindex/core/config'
import { CtxindexValidationError } from '@ctxindex/core/errors'
import { oauthAppUsage, parseOAuthAppArgs } from '../args/oauth-app'
import { assertInitialized } from '../commands/db'
import { loadCliDefinitions } from '../definitions'
import { openDeps } from '../deps'
import { mapErrorToExit } from '../format/exit'
import {
  formatOAuthAppAdded,
  formatOAuthAppInventory,
  formatOAuthAppRemoved,
} from '../format/oauth-app'

export async function handleOAuthAppCommand(args: string[]): Promise<number> {
  const parsed = parseOAuthAppArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${oauthAppUsage}`)
    return 2
  }

  let deps: Awaited<ReturnType<typeof openDeps>> | undefined
  try {
    if (parsed.kind === 'add') {
      const definitions = await loadCliDefinitions()
      const provider = definitions.completeRegistry.providers.get(
        parsed.provider,
      )
      if (!provider || provider.auth.kind !== 'oauth2') {
        throw new CtxindexValidationError(
          'invalid_oauth_selection',
          `Unknown OAuth provider: ${parsed.provider}`,
        )
      }
      await assertInitialized()
      const config: Record<string, string> = {}
      for (const [field, name] of Object.entries(
        provider.auth.registration.environment,
      )) {
        if (typeof name !== 'string') continue
        const value = readEnvironmentVariable(name)
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
      deps = await openDeps({ config: definitions.config })
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
      await assertInitialized()
      deps = await openDeps()
      if (parsed.kind === 'list') {
        console.log(
          formatOAuthAppInventory(deps.oauthAppService.listApps(), parsed.json),
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
    await deps?.close()
  }
}
