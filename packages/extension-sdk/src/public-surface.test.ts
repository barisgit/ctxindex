import { expect, test } from 'bun:test'
import type {
  ActionContext,
  ActionResource,
  AdapterActionBinding,
  AdapterCapability,
  AdapterDefinition,
  AdapterLogger,
  AdapterOperations,
  AdapterOperationsFor,
  AdapterSourceContext,
  AnyAdapterDefinition,
  AnyExtensionDefinition,
  AnyOAuthAppDefinition,
  AnyProfileDefinition,
  AnyProviderDefinition,
  ArtifactDescriptor,
  DefinitionVersion,
  DownloadContext,
  ExtensionDefinition,
  FieldType,
  InferProfilePayload,
  NoneAuth,
  OAuth2Auth,
  OAuth2RegistrationPolicy,
  OAuthAppDefinition,
  OAuthProviderDefinition,
  ProfileAction,
  ProfileDefinition,
  ProfileExportRenderResult,
  ProfileField,
  ProfileRelationTarget,
  ProfileRelationTargets,
  ProfileTarget,
  ProviderAuth,
  ProviderDefinition,
  ResolvedArtifactDescriptor,
  RetrieveContext,
  RetrievedResource,
  SearchContext,
  SearchFieldFilter,
  SearchRemoteQuery,
  SearchRemoteResource,
  SearchRemoteResult,
  SearchRemoteWarning,
  SearchRouting,
  SyncContext,
  SyncEmission,
  SyncedResource,
  SyncMode,
} from './index'
import * as runtimeSdk from './index'

type PublicTypeSurface = {
  actionContext: ActionContext
  actionResource: ActionResource
  adapterActionBinding: AdapterActionBinding
  adapterCapability: AdapterCapability
  adapterDefinition: AdapterDefinition
  adapterLogger: AdapterLogger
  adapterOperations: AdapterOperations
  adapterOperationsFor: AdapterOperationsFor<readonly []>
  adapterSourceContext: AdapterSourceContext
  anyAdapterDefinition: AnyAdapterDefinition
  anyExtensionDefinition: AnyExtensionDefinition
  anyOAuthAppDefinition: AnyOAuthAppDefinition
  anyProfileDefinition: AnyProfileDefinition
  anyProviderDefinition: AnyProviderDefinition
  artifactDescriptor: ArtifactDescriptor
  definitionVersion: DefinitionVersion
  downloadContext: DownloadContext
  extensionDefinition: ExtensionDefinition
  fieldType: FieldType
  inferredProfilePayload: InferProfilePayload<AnyProfileDefinition>
  noneAuth: NoneAuth
  oauth2Auth: OAuth2Auth
  oauth2RegistrationPolicy: OAuth2RegistrationPolicy
  oauthAppDefinition: OAuthAppDefinition
  oauthProviderDefinition: OAuthProviderDefinition
  profileAction: ProfileAction
  profileDefinition: ProfileDefinition
  profileExportRenderResult: ProfileExportRenderResult
  profileField: ProfileField
  profileRelationTarget: ProfileRelationTarget
  profileRelationTargets: ProfileRelationTargets
  profileTarget: ProfileTarget
  providerAuth: ProviderAuth
  providerDefinition: ProviderDefinition
  resolvedArtifactDescriptor: ResolvedArtifactDescriptor
  retrievedResource: RetrievedResource
  retrieveContext: RetrieveContext
  searchContext: SearchContext
  searchFieldFilter: SearchFieldFilter
  searchRemoteQuery: SearchRemoteQuery
  searchRemoteResource: SearchRemoteResource
  searchRemoteResult: SearchRemoteResult
  searchRemoteWarning: SearchRemoteWarning
  searchRouting: SearchRouting
  syncedResource: SyncedResource
  syncContext: SyncContext
  syncEmission: SyncEmission
  syncMode: SyncMode
}

const publicTypeSurfaceCompiles: PublicTypeSurface | undefined = undefined
void publicTypeSurfaceCompiles

const publicSymbolNames = [
  'ActionContext',
  'ActionResource',
  'AdapterActionBinding',
  'AdapterCapability',
  'AdapterDefinition',
  'AdapterLogger',
  'AdapterOperations',
  'AdapterOperationsFor',
  'AdapterSourceContext',
  'AnyAdapterDefinition',
  'AnyExtensionDefinition',
  'AnyOAuthAppDefinition',
  'AnyProfileDefinition',
  'AnyProviderDefinition',
  'ArtifactDescriptor',
  'DefinitionVersion',
  'DownloadContext',
  'ExtensionDefinition',
  'FieldType',
  'InferProfilePayload',
  'NoneAuth',
  'OAuth2Auth',
  'OAuth2RegistrationPolicy',
  'OAuthAppDefinition',
  'OAuthProviderDefinition',
  'ProfileAction',
  'ProfileDefinition',
  'ProfileExportRenderResult',
  'ProfileField',
  'ProfileRelationTarget',
  'ProfileRelationTargets',
  'ProfileTarget',
  'ProviderAuth',
  'ProviderDefinition',
  'ResolvedArtifactDescriptor',
  'RetrieveContext',
  'RetrievedResource',
  'SearchContext',
  'SearchFieldFilter',
  'SearchRemoteQuery',
  'SearchRemoteResource',
  'SearchRemoteResult',
  'SearchRemoteWarning',
  'SearchRouting',
  'SyncContext',
  'SyncEmission',
  'SyncMode',
  'SyncedResource',
  'auth',
  'defineAdapter',
  'defineExtension',
  'defineOAuthApp',
  'defineProfile',
  'defineProvider',
  'z',
]

test('public index exports the exact symbol surface', async () => {
  const source = await Bun.file(new URL('index.ts', import.meta.url)).text()
  const exportedNames = [
    ...source.matchAll(/export(?:\s+type)?\s*\{([\s\S]*?)\}\s*from/g),
  ]
    .flatMap((match) =>
      match[1]
        ?.split(',')
        .map((entry) => entry.trim().replace(/^type\s+/, ''))
        .filter(Boolean),
    )
    .sort()

  expect(exportedNames).toEqual(publicSymbolNames)
  expect(Object.keys(runtimeSdk).sort()).toEqual([
    'auth',
    'defineAdapter',
    'defineExtension',
    'defineOAuthApp',
    'defineProfile',
    'defineProvider',
    'z',
  ])
})
