import type {
  AnyOAuthAppDefinition,
  OAuthProviderDefinition,
} from '@ctxindex/extension-sdk'
import type { CompleteRegistry, DefinitionProvenance } from '../registry'
import type { SecretsStore } from '../secrets'
import type { CtxindexDatabase } from '../storage'

export interface AddLocalOAuthAppInput {
  readonly providerId: string
  readonly label: string
  readonly config: unknown
}

export interface SafeExtensionOAuthAppProvenance {
  readonly kind: 'extension'
  readonly source: DefinitionProvenance['origin']
  readonly packageName?: string
  readonly packageVersion?: string
  readonly integrity?: string
  readonly commit?: string
}

export type SafeOAuthAppProvenance =
  | { readonly kind: 'local' }
  | SafeExtensionOAuthAppProvenance

export interface OAuthAppInventoryItem {
  readonly providerId: string
  readonly label: string
  readonly origin: 'extension' | 'local'
  readonly provenance: SafeOAuthAppProvenance
}

export interface ResolvedOAuthApp {
  readonly provider: OAuthProviderDefinition
  readonly label: string
  readonly config: Readonly<Record<string, unknown>>
  readonly definition?: AnyOAuthAppDefinition
}

export interface OAuthAppServiceDeps {
  readonly db: CtxindexDatabase
  readonly store: SecretsStore
  readonly registry: CompleteRegistry
  readonly now?: () => number
}

export interface OAuthAppService {
  addLocalApp(input: AddLocalOAuthAppInput): Promise<void>
  removeLocalApp(providerId: string, label: string): Promise<void>
  listApps(): readonly OAuthAppInventoryItem[]
  resolveApp(providerId: string, label: string): Promise<ResolvedOAuthApp>
}
