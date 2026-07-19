export {
  type AdapterActionBinding,
  type AdapterAuthSpec,
  type AdapterCapability,
  type AdapterDefinition,
  type AdapterOperations,
  type AdapterOperationsFor,
  type AnyAdapterDefinition,
  defineAdapter,
  type OAuthProviderSpec,
  type SearchRouting,
} from './adapter'
export {
  type AnyExtensionDefinition,
  defineExtension,
  type ExtensionAuthoringHost,
  type ExtensionDefinition,
} from './extension'

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
export type { DefinitionVersion, ProfileReference } from './reference'
