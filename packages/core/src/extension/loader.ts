import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  AnyExtensionDefinition,
  ExtensionAuthoringHost,
} from '@ctxindex/extension-sdk'
import {
  defineAdapter,
  defineExtension,
  defineProfile,
} from '@ctxindex/extension-sdk'
import { z } from 'zod'
import type { CtxindexConfig } from '../config'
import { createExtensionRegistry, type ExtensionRegistry } from '../registry'

export interface ExtensionLoadDiagnostic {
  readonly path: string
  readonly message: string
}

export interface LoadExtensionsInput {
  readonly config: CtxindexConfig
  readonly builtins: readonly AnyExtensionDefinition[]
}

export interface LoadExtensionsResult {
  readonly registry: ExtensionRegistry
  readonly diagnostics: readonly ExtensionLoadDiagnostic[]
}

const authoringHost: ExtensionAuthoringHost = {
  z,
  defineProfile,
  defineAdapter,
  defineExtension,
}

type ExtensionModule = {
  readonly default?: (
    host: ExtensionAuthoringHost,
  ) => AnyExtensionDefinition | Promise<AnyExtensionDefinition>
}

export async function loadExtensions(
  input: LoadExtensionsInput,
): Promise<LoadExtensionsResult> {
  if (!Array.isArray(input.builtins)) {
    throw new TypeError(
      'loadExtensions requires an explicit complete builtins list',
    )
  }
  const registry = createExtensionRegistry(input.builtins)
  const diagnostics: ExtensionLoadDiagnostic[] = []

  for (const configuredPath of input.config.extensions.paths) {
    const extensionPath = resolve(configuredPath)
    try {
      const loaded = (await import(
        pathToFileURL(extensionPath).href
      )) as ExtensionModule
      if (typeof loaded.default !== 'function') {
        throw new TypeError('Extension must default-export a factory')
      }
      registry.register(await loaded.default(authoringHost))
    } catch (cause) {
      diagnostics.push({
        path: extensionPath,
        message: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }

  return { registry, diagnostics }
}
