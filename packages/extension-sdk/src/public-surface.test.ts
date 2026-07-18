import { expect, test } from 'bun:test'
import type {
  ActionContext,
  ActionResource,
  AdapterActionBinding,
  AdapterAuthSpec,
  AdapterCapability,
  AdapterDefinition,
  AdapterLogger,
  AdapterOperations,
  AdapterOperationsFor,
  AdapterSourceContext,
  AnyAdapterDefinition,
  AnyExtensionDefinition,
  AnyProfileDefinition,
  ArtifactDescriptor,
  DefinitionVersion,
  DownloadContext,
  ExtensionAuthoringHost,
  ExtensionDefinition,
  FieldType,
  InferProfilePayload,
  OAuthProviderSpec,
  ProfileAction,
  ProfileDefinition,
  ProfileExportRenderResult,
  ProfileField,
  ProfileReference,
  ProfileRelationTarget,
  ProfileRelationTargets,
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
  adapterAuthSpec: AdapterAuthSpec
  adapterCapability: AdapterCapability
  adapterDefinition: AdapterDefinition
  adapterLogger: AdapterLogger
  adapterOperations: AdapterOperations
  adapterOperationsFor: AdapterOperationsFor<readonly []>
  adapterSourceContext: AdapterSourceContext
  anyAdapterDefinition: AnyAdapterDefinition
  anyExtensionDefinition: AnyExtensionDefinition
  anyProfileDefinition: AnyProfileDefinition
  artifactDescriptor: ArtifactDescriptor
  definitionVersion: DefinitionVersion
  downloadContext: DownloadContext
  extensionAuthoringHost: ExtensionAuthoringHost
  extensionDefinition: ExtensionDefinition
  fieldType: FieldType
  inferredProfilePayload: InferProfilePayload<AnyProfileDefinition>
  oauthProviderSpec: OAuthProviderSpec
  profileAction: ProfileAction
  profileDefinition: ProfileDefinition
  profileExportRenderResult: ProfileExportRenderResult
  profileField: ProfileField
  profileReference: ProfileReference
  profileRelationTarget: ProfileRelationTarget
  profileRelationTargets: ProfileRelationTargets
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
  'AdapterAuthSpec',
  'AdapterCapability',
  'AdapterDefinition',
  'AdapterLogger',
  'AdapterOperations',
  'AdapterOperationsFor',
  'AdapterSourceContext',
  'AnyAdapterDefinition',
  'AnyExtensionDefinition',
  'AnyProfileDefinition',
  'ArtifactDescriptor',
  'DefinitionVersion',
  'DownloadContext',
  'ExtensionAuthoringHost',
  'ExtensionDefinition',
  'FieldType',
  'InferProfilePayload',
  'OAuthProviderSpec',
  'ProfileAction',
  'ProfileDefinition',
  'ProfileExportRenderResult',
  'ProfileField',
  'ProfileReference',
  'ProfileRelationTarget',
  'ProfileRelationTargets',
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
  'defineAdapter',
  'defineExtension',
  'defineProfile',
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
    'defineAdapter',
    'defineExtension',
    'defineProfile',
  ])
})
