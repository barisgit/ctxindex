import type {
  AnyOAuthAppDefinition,
  OAuthProviderDefinition,
} from '@ctxindex/extension-sdk'
import { ulid } from 'ulid'
import { CtxindexNotFoundError, CtxindexValidationError } from '../errors'
import { compareUnicodeCodePoints } from '../internal/code-point-order'
import type { DefinitionProvenance } from '../registry'
import type {
  AddLocalOAuthAppInput,
  OAuthAppInventoryItem,
  OAuthAppService,
  OAuthAppServiceDeps,
  ResolvedOAuthApp,
  SafeExtensionOAuthAppProvenance,
} from './types'

interface LocalOAuthAppRow {
  readonly provider_id: string
  readonly label: string
  readonly config_ref: string
}

function identity(providerId: string, label: string): string {
  return `${providerId}\u0000${label}`
}

function extensionApps(
  deps: OAuthAppServiceDeps,
): Map<string, AnyOAuthAppDefinition> {
  return new Map(
    [...deps.registry.oauthApps.values()].map((app) => [
      identity(app.provider.id, app.label),
      app,
    ]),
  )
}

function extensionAppProvenance(
  deps: OAuthAppServiceDeps,
  app: AnyOAuthAppDefinition,
): DefinitionProvenance | undefined {
  for (const [key, candidate] of deps.registry.oauthApps) {
    if (
      candidate.provider.id === app.provider.id &&
      candidate.label === app.label
    ) {
      return deps.registry.provenances.get(`oauth-app:${key}`)?.[0]
    }
  }
  return undefined
}

function oauthProvider(
  deps: OAuthAppServiceDeps,
  providerId: string,
): OAuthProviderDefinition {
  const provider = deps.registry.providers.get(providerId)
  if (!provider || provider.auth.kind !== 'oauth2') {
    throw new CtxindexValidationError(
      'invalid_oauth_selection',
      `Unknown OAuth Provider "${providerId}"`,
    )
  }
  return provider as OAuthProviderDefinition
}

function validateConfig(
  provider: OAuthProviderDefinition,
  config: unknown,
): Readonly<Record<string, unknown>> {
  const parsed = provider.auth.registration.configSchema.safeParse(config)
  if (
    !parsed.success ||
    parsed.data === null ||
    typeof parsed.data !== 'object' ||
    Array.isArray(parsed.data)
  ) {
    throw new CtxindexValidationError(
      'invalid_filter',
      'OAuth App configuration is invalid for the selected Provider',
    )
  }
  return parsed.data as Readonly<Record<string, unknown>>
}

function safeProvenance(
  provenance: DefinitionProvenance,
): SafeExtensionOAuthAppProvenance {
  return {
    kind: 'extension',
    source: provenance.origin,
    ...(provenance.packageName === undefined
      ? {}
      : { packageName: provenance.packageName }),
    ...(provenance.packageVersion === undefined
      ? {}
      : { packageVersion: provenance.packageVersion }),
    ...(provenance.integrity === undefined
      ? {}
      : { integrity: provenance.integrity }),
    ...(provenance.commit === undefined ? {} : { commit: provenance.commit }),
  }
}

export function createOAuthAppService(
  deps: OAuthAppServiceDeps,
): OAuthAppService {
  const now = deps.now ?? Date.now

  return {
    async addLocalApp(input: AddLocalOAuthAppInput): Promise<void> {
      if (input.label.trim().length === 0) {
        throw new CtxindexValidationError(
          'invalid_filter',
          'OAuth App label must be nonempty',
        )
      }
      const provider = oauthProvider(deps, input.providerId)
      const config = validateConfig(provider, input.config)
      if (extensionApps(deps).has(identity(input.providerId, input.label))) {
        throw new CtxindexValidationError(
          'invalid_filter',
          `OAuth App "${input.label}" already exists for Provider "${input.providerId}"`,
        )
      }
      const collision = deps.db
        .prepare('SELECT 1 FROM oauth_apps WHERE provider_id = ? AND label = ?')
        .get(input.providerId, input.label)
      if (collision) {
        throw new CtxindexValidationError(
          'invalid_filter',
          `OAuth App "${input.label}" already exists for Provider "${input.providerId}"`,
        )
      }
      const configRef = await deps.store.setSecret(
        input.providerId,
        `oauth-app:${input.label}:config:${ulid()}`,
        JSON.stringify(config),
      )
      const timestamp = now()
      try {
        deps.db
          .prepare(
            'INSERT INTO oauth_apps (provider_id, label, config_ref, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          )
          .run(input.providerId, input.label, configRef, timestamp, timestamp)
      } catch (cause) {
        try {
          await deps.store.deleteSecret(configRef)
        } catch {}
        throw cause
      }
    },

    async removeLocalApp(providerId: string, label: string): Promise<void> {
      const row = deps.db
        .prepare(
          'SELECT config_ref FROM oauth_apps WHERE provider_id = ? AND label = ?',
        )
        .get(providerId, label) as { readonly config_ref: string } | null
      if (!row)
        throw new CtxindexNotFoundError(
          `OAuth App not found: Provider "${providerId}", label "${label}"`,
        )
      deps.db
        .prepare('DELETE FROM oauth_apps WHERE provider_id = ? AND label = ?')
        .run(providerId, label)
      try {
        await deps.store.deleteSecret(row.config_ref)
      } catch {}
    },

    listApps(): readonly OAuthAppInventoryItem[] {
      const items: OAuthAppInventoryItem[] = []
      for (const app of extensionApps(deps).values()) {
        const provenance = extensionAppProvenance(deps, app)
        if (!provenance) continue
        items.push({
          providerId: app.provider.id,
          label: app.label,
          origin: 'extension',
          provenance: safeProvenance(provenance),
        })
      }
      const locals = deps.db
        .prepare(
          'SELECT provider_id, label FROM oauth_apps ORDER BY provider_id, label',
        )
        .all() as Pick<LocalOAuthAppRow, 'provider_id' | 'label'>[]
      for (const row of locals) {
        items.push({
          providerId: row.provider_id,
          label: row.label,
          origin: 'local',
          provenance: { kind: 'local' },
        })
      }
      return items.sort((left, right) =>
        compareUnicodeCodePoints(
          identity(left.providerId, left.label),
          identity(right.providerId, right.label),
        ),
      )
    },

    async resolveApp(
      providerId: string,
      label: string,
    ): Promise<ResolvedOAuthApp> {
      const provider = oauthProvider(deps, providerId)
      const extension = extensionApps(deps).get(identity(providerId, label))
      const local = deps.db
        .prepare(
          'SELECT provider_id, label, config_ref FROM oauth_apps WHERE provider_id = ? AND label = ?',
        )
        .get(providerId, label) as LocalOAuthAppRow | null
      if (extension && local) {
        throw new CtxindexValidationError(
          'invalid_oauth_selection',
          `OAuth App identity is duplicated for Provider "${providerId}", label "${label}"`,
        )
      }
      if (extension) {
        return {
          provider,
          label,
          config: validateConfig(provider, extension.config),
          definition: extension,
        }
      }
      if (local) {
        const serialized = await deps.store.getSecret(local.config_ref)
        let config: unknown
        try {
          config = JSON.parse(serialized)
        } catch (cause) {
          throw new CtxindexValidationError(
            'invalid_filter',
            'Stored OAuth App configuration is invalid JSON',
            { cause },
          )
        }
        return { provider, label, config: validateConfig(provider, config) }
      }
      throw new CtxindexValidationError(
        'invalid_oauth_selection',
        `OAuth App "${label}" is not available for Provider "${providerId}"`,
      )
    },
  }
}
