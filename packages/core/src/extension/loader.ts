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
import type { CtxindexDatabase } from '../storage'

export interface ExtensionLoadDiagnostic {
  readonly path: string
  readonly message: string
}

function reconcileSourceAvailability(
  db: CtxindexDatabase,
  registry: ExtensionRegistry,
): void {
  const adapterIds = registry.adapters.list().map((adapter) => adapter.id)
  const missingFilter =
    adapterIds.length === 0
      ? 'WHERE 1 = 1'
      : `WHERE adapter_id NOT IN (${adapterIds.map(() => '?').join(', ')})`

  db.transaction(() => {
    const now = Date.now()
    if (adapterIds.length > 0) {
      db.prepare(
        `UPDATE source_sync_state
            SET last_status = 'idle', updated_at = ?
          WHERE last_status = 'extension_unavailable'
            AND source_id IN (
              SELECT id FROM sources
               WHERE adapter_id IN (${adapterIds.map(() => '?').join(', ')})
            )`,
      ).run(now, ...adapterIds)
    }

    db.prepare(
      `INSERT INTO source_sync_state (
         source_id, last_status, last_run_id, cursor_json, updated_at
       )
       SELECT id, 'extension_unavailable', NULL, NULL, ?
         FROM sources
         ${missingFilter}
       ON CONFLICT(source_id) DO UPDATE SET
         last_status = excluded.last_status,
         updated_at = excluded.updated_at`,
    ).run(now, ...adapterIds)
  })()
}

export interface LoadExtensionsInput {
  readonly config: CtxindexConfig
  readonly builtins: readonly AnyExtensionDefinition[]
  readonly db?: CtxindexDatabase
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

  if (input.db) {
    reconcileSourceAvailability(input.db, registry)
  }

  return { registry, diagnostics }
}
