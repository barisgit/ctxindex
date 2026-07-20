export { z } from 'zod'

export {
  type AdapterActionBinding,
  type AdapterCapability,
  type AdapterDefinition,
  type AdapterOperations,
  type AdapterOperationsFor,
  type AnyAdapterDefinition,
  defineAdapter,
  type ProfileTarget,
  type SearchRouting,
} from './adapter'
export {
  type DocumentationAssetMediaType,
  type DocumentationDeclaration,
  type DocumentationDirectoryDeclaration,
  type DocumentationFile,
  type DocumentationVirtualTreeDeclaration,
  docs,
} from './documentation'
export {
  type AnyExtensionDefinition,
  defineExtension,
  type ExtensionDefinition,
} from './extension'
export {
  type AnyOAuthAppDefinition,
  defineOAuthApp,
  type OAuthAppDefinition,
  type OAuthProviderDefinition,
} from './oauth-app'
export type {
  ActionArtifact,
  ActionContext,
  ActionResource,
  AdapterLogger,
  AdapterSourceContext,
  DownloadContext,
  RetrieveContext,
  RetrievedResource,
  SearchContext,
  SearchFieldFilter,
  SearchRemoteQuery,
  SearchRemoteResource,
  SearchRemoteResult,
  SearchRemoteWarning,
  SyncContext,
  SyncEmission,
  SyncedResource,
  SyncMode,
} from './operations'
export {
  type AnyProfileDefinition,
  type ArtifactDescriptor,
  type DefinitionVersion,
  defineProfile,
  type FieldType,
  type InferProfilePayload,
  type ProfileAction,
  type ProfileDefinition,
  type ProfileExportRenderResult,
  type ProfileField,
  type ProfileRelationTarget,
  type ProfileRelationTargets,
  type ResolvedArtifactDescriptor,
} from './profile'
export {
  type AnyProviderDefinition,
  auth,
  defineProvider,
  type NoneAuth,
  type OAuth2Auth,
  type OAuth2RegistrationPolicy,
  type ProviderAuth,
  type ProviderDefinition,
} from './provider'
