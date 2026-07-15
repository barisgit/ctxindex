import type { z } from 'zod'
import type {
  AdapterAuthSpec,
  AdapterCapabilities,
  AdapterProvider,
  AdapterSearchFunction,
  AdapterSearchMode,
  SourceAdapterDefinition,
  SourceKind,
  SyncFunction,
  SyncMode,
} from './types'

export interface CtxindexAdapterRegistryHandle<
  TAdapters extends Record<string, SourceAdapterDefinition>,
> {
  readonly adapters: TAdapters
  readonly adapterIds: readonly [
    Extract<keyof TAdapters, string>,
    ...Extract<keyof TAdapters, string>[],
  ]
  readonly providers: readonly AdapterProvider[]

  isKnownAdapter(v: string): v is Extract<keyof TAdapters, string>
  assertKnownAdapter(v: string): asserts v is Extract<keyof TAdapters, string>
  getAdapter<TId extends Extract<keyof TAdapters, string>>(
    id: TId,
  ): TAdapters[TId]
  getLabel(id: Extract<keyof TAdapters, string>): string
  getProvider(id: Extract<keyof TAdapters, string>): AdapterProvider

  listAdapters(): readonly SourceAdapterDefinition[]
  listAdapterIds(): readonly Extract<keyof TAdapters, string>[]
  getAdaptersByProvider(
    provider: AdapterProvider,
  ): readonly SourceAdapterDefinition[]
  getAdaptersByKind(kind: SourceKind): readonly SourceAdapterDefinition[]

  getCapabilities(id: Extract<keyof TAdapters, string>): AdapterCapabilities
  getSupportedModes(id: Extract<keyof TAdapters, string>): readonly SyncMode[]
  supportsMode(id: Extract<keyof TAdapters, string>, mode: SyncMode): boolean
  supportsResume(id: Extract<keyof TAdapters, string>): boolean
  supportsAttachments(id: Extract<keyof TAdapters, string>): boolean
  supportsRawRecords(id: Extract<keyof TAdapters, string>): boolean

  getSearchMode(id: Extract<keyof TAdapters, string>): AdapterSearchMode
  getSearchFn(
    id: Extract<keyof TAdapters, string>,
  ): AdapterSearchFunction | undefined
  listFederatedAdapters(): readonly SourceAdapterDefinition[]

  getSyncFn(id: Extract<keyof TAdapters, string>): SyncFunction
  getSchema(
    id: Extract<keyof TAdapters, string>,
  ): Readonly<Record<string, unknown>>
  getConfigSchema(id: Extract<keyof TAdapters, string>): z.ZodTypeAny

  getAuthSpec(id: Extract<keyof TAdapters, string>): AdapterAuthSpec
  isOAuth2(id: Extract<keyof TAdapters, string>): boolean
  listOAuth2Adapters(): readonly SourceAdapterDefinition[]
  listOAuth2AdaptersByProvider(
    provider: 'google' | 'microsoft',
  ): readonly SourceAdapterDefinition[]
  getRequiredScopes(
    id: Extract<keyof TAdapters, string>,
  ): readonly string[] | null

  registerAdapter(
    adapter: SourceAdapterDefinition,
  ): SourceAdapterDefinition | undefined
  unregisterAdapter(id: string): SourceAdapterDefinition | undefined
}
