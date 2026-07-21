import { readEnvironmentVariable } from '@ctxindex/core/config'
import { CtxindexValidationError } from '@ctxindex/core/errors'
import { assertInitialized } from '../commands/db'
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

export interface OAuthAppCommandDeps {
  readonly acquireOwnership: typeof acquireDirectDatabaseOwnership
  readonly loadDefinitions: typeof loadCliDefinitions
  readonly open: typeof openDeps
  readonly assertInitialized: typeof assertInitialized
  readonly readEnvironmentVariable: typeof readEnvironmentVariable
}

export type OAuthAppCommandInput =
  | { readonly kind: 'add'; readonly provider: string; readonly label: string }
  | { readonly kind: 'list'; readonly json: boolean }
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
}

export async function handleOAuthAppCommand(
  parsed: OAuthAppCommandInput,
  services: OAuthAppCommandDeps = defaultDeps,
): Promise<number> {
  let deps: Awaited<ReturnType<typeof openDeps>> | undefined
  let ownership: DirectDatabaseOwnership | undefined
  try {
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
    ownership?.close()
  }
}
