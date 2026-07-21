import { join } from 'node:path'
import { DirectExtensionStore } from '@ctxindex/core'
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
import * as CTXINDEX_BUILTIN_MODULE from '@ctxindex/official'

export interface CliDefinitions extends LoadExtensionsResult {
  readonly config: CtxindexConfig
  readonly description: RegistryDescription
}

export interface LoadCliDefinitionsOptions {
  readonly config?: CtxindexConfig
  readonly configRoot?: string
  readonly dataRoot?: string
  readonly localOAuthAppIdentities?: readonly OAuthAppIdentity[]
}

export async function loadCliDefinitions(
  options: LoadCliDefinitionsOptions = {},
): Promise<CliDefinitions> {
  const config =
    options.config ??
    (await readConfig(
      options.configRoot === undefined
        ? undefined
        : join(options.configRoot, 'config.toml'),
    ))
  const installed = await new DirectExtensionStore({
    ...(options.configRoot === undefined
      ? {}
      : { configRoot: options.configRoot }),
    ...(options.dataRoot === undefined ? {} : { dataRoot: options.dataRoot }),
  }).readRecordsForLoading()
  const loaded = await loadExtensions({
    config,
    builtins: CTXINDEX_BUILTIN_MODULE,
    installed: installed.records,
    ...(options.dataRoot === undefined ? {} : { dataRoot: options.dataRoot }),
    ...(options.localOAuthAppIdentities === undefined
      ? {}
      : { localOAuthAppIdentities: options.localOAuthAppIdentities }),
  })
  return {
    ...loaded,
    diagnostics: [
      ...installed.diagnostics.map((message) => ({
        path: 'installed-records',
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
