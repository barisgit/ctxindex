import * as CTXINDEX_BUILTIN_MODULE from '@ctxindex/adapters'
import { DirectExtensionStore } from '@ctxindex/core'
import { CatalogStore } from '@ctxindex/core/catalog'
import { type CtxindexConfig, readConfig } from '@ctxindex/core/config'
import {
  type LoadExtensionsResult,
  loadExtensions,
} from '@ctxindex/core/extension'
import type { OAuthAppIdentity } from '@ctxindex/core/registry'
import {
  describeRegistry,
  type RegistryDescription,
} from '@ctxindex/core/registry'

export interface CliDefinitions extends LoadExtensionsResult {
  readonly config: CtxindexConfig
  readonly description: RegistryDescription
}

export interface LoadCliDefinitionsOptions {
  readonly config?: CtxindexConfig
  readonly localOAuthAppIdentities?: readonly OAuthAppIdentity[]
}

export async function loadCliDefinitions(
  options: LoadCliDefinitionsOptions = {},
): Promise<CliDefinitions> {
  const config = options.config ?? (await readConfig())
  const installed = await new CatalogStore().readInstalled()
  const direct = await new DirectExtensionStore().readRecordsForLoading()
  const loaded = await loadExtensions({
    config,
    builtins: CTXINDEX_BUILTIN_MODULE,
    installed,
    directInstalled: direct.records,
    ...(options.localOAuthAppIdentities === undefined
      ? {}
      : { localOAuthAppIdentities: options.localOAuthAppIdentities }),
  })
  return {
    ...loaded,
    diagnostics: [
      ...direct.diagnostics.map((message) => ({
        path: 'direct-records',
        message,
      })),
      ...loaded.diagnostics,
    ],
    config,
    description: describeRegistry(loaded.registry),
  }
}

export function printExtensionDiagnostics(
  diagnostics: CliDefinitions['diagnostics'],
): void {
  for (const diagnostic of diagnostics) {
    console.error(`Extension ${diagnostic.path}: ${diagnostic.message}`)
  }
}
