import { CtxindexError } from '@ctxindex/core/errors'
import { assertInitialized } from './commands/db'
import {
  daemonExtensionList,
  daemonRegistryDescribe,
  selectDaemon,
} from './daemon/client'
import {
  ensureDaemonSelection,
  selectEnsuredDaemonRoute,
} from './daemon/ensure'
import { loadCliDefinitions } from './definitions'
import type { ExtensionCommandServices } from './extensions/services'

async function selectRegistryDaemon() {
  try {
    await assertInitialized()
  } catch (error) {
    if (!(error instanceof CtxindexError) || error.code !== 'invalid_args')
      throw error
    // Canonical pure discovery is available before initialization, without state.
    return null
  }
  return selectEnsuredDaemonRoute({ ensureDaemonSelection, selectDaemon })
}

export async function loadExtensionInventory(
  services: Pick<ExtensionCommandServices, 'loadDefinitions' | 'direct'>,
) {
  const selection = await selectRegistryDaemon()
  if (selection !== null) {
    const result = await daemonExtensionList(selection)
    return {
      ...result,
      registry: { list: () => result.rows },
      installed: result.installed.map(({ curation, ...entry }) => ({
        ...entry,
        ...(curation === undefined ? {} : { curation }),
      })),
    }
  }
  const loaded = await services.loadDefinitions()
  return { ...loaded, installed: await services.direct.list() }
}

export async function loadRegistryDescription() {
  const selection = await selectRegistryDaemon()
  if (selection !== null) return daemonRegistryDescribe(selection)
  const loaded = await loadCliDefinitions()
  return { description: loaded.description, diagnostics: loaded.diagnostics }
}
