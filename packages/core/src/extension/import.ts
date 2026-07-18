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

export async function importExtensionDefinition(
  extensionPath: string,
): Promise<AnyExtensionDefinition> {
  const loaded = (await import(
    pathToFileURL(extensionPath).href
  )) as ExtensionModule
  if (typeof loaded.default !== 'function') {
    throw new TypeError('Extension must default-export a factory')
  }
  return loaded.default(authoringHost)
}
