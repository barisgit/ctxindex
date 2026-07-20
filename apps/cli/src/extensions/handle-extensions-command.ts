import { join } from 'node:path'
import {
  BunPackageMaterializer,
  DirectExtensionService,
  DirectExtensionStore,
  parseDirectExtensionTarget,
  projectDirectExtensionRecord,
  readDirectExtensionSourceBindings,
  validateDirectPackageTarget,
} from '@ctxindex/core'
import { CatalogService } from '@ctxindex/core/catalog'
import { safeExtensionDiagnostic } from '@ctxindex/core/extension'
import { readLocalOAuthAppIdentities } from '@ctxindex/core/oauth-app'
import { dataDir } from '@ctxindex/core/paths'
import { parseExtensionsArgs } from '../args/extensions'
import { loadCliDefinitions, printExtensionDiagnostics } from '../definitions'
import {
  formatCatalog,
  formatCatalogExtension,
  formatCatalogs,
  formatInstalledExtension,
} from '../format/catalog'
import {
  formatDirectExtension,
  formatDirectExtensionUninstall,
} from '../format/direct-extension'
import { mapErrorToExit } from '../format/exit'
import { formatExtensions } from '../format/registry'

function createDirectExtensionService(): DirectExtensionService {
  const root = dataDir()
  return new DirectExtensionService({
    store: new DirectExtensionStore({ dataRoot: root }),
    materializer: new BunPackageMaterializer({
      stagingParent: join(root, 'direct-extensions', 'staging'),
    }),
  })
}

export async function handleExtensionsCommand(
  args: string[],
  catalogs: CatalogService = new CatalogService(),
  direct: DirectExtensionService = createDirectExtensionService(),
): Promise<number> {
  const parsed = parseExtensionsArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(parsed.message)
    return 2
  }
  try {
    if (parsed.kind === 'list') {
      const loaded = await loadCliDefinitions()
      printExtensionDiagnostics(loaded.diagnostics)
      console.log(
        formatExtensions(loaded.registry, parsed.json, loaded.provenance),
      )
      return 0
    }
    if (parsed.kind === 'catalog-add') {
      const result = await catalogs.add({
        name: parsed.name,
        repository: parsed.repository,
        ref: parsed.ref,
        trust: parsed.trust,
      })
      console.log(formatCatalog(result, parsed.json))
      return 0
    }
    if (parsed.kind === 'catalog-list') {
      console.log(
        formatCatalogs(
          await catalogs.list({ refresh: !parsed.noRefresh }),
          parsed.json,
        ),
      )
      return 0
    }
    if (parsed.kind === 'catalog-show') {
      if (parsed.extension === undefined) {
        console.log(
          formatCatalog(
            await catalogs.show(parsed.name, {
              refresh: !parsed.noRefresh,
            }),
            parsed.json,
          ),
        )
      } else {
        const shown = await catalogs.showExtension(
          parsed.name,
          parsed.extension.id,
          parsed.extension.version,
          { refresh: !parsed.noRefresh },
        )
        console.log(
          formatCatalogExtension(shown.catalog, shown.extension, parsed.json),
        )
      }
      return 0
    }
    if (parsed.kind === 'catalog-refresh') {
      console.log(
        formatCatalog(
          await catalogs.refresh({ name: parsed.name }),
          parsed.json,
        ),
      )
      return 0
    }
    if (parsed.kind === 'catalog-remove') {
      console.log(
        formatCatalog(await catalogs.remove(parsed.name), parsed.json),
      )
      return 0
    }
    if (parsed.kind === 'catalog-install') {
      const localOAuthAppIdentities = readLocalOAuthAppIdentities()
      const loaded = await loadCliDefinitions({ localOAuthAppIdentities })
      printExtensionDiagnostics(loaded.diagnostics)
      const replaceableCatalog = loaded.provenance.find(
        (provenance) =>
          provenance.kind === 'catalog' &&
          provenance.id === parsed.extension.id,
      )
      console.log(
        formatInstalledExtension(
          'Installed',
          await catalogs.install({
            catalog: parsed.catalog,
            id: parsed.extension.id,
            version: parsed.extension.version,
            trust: parsed.trust,
            registry: loaded.registry,
            localOAuthAppIdentities,
            refresh: !parsed.noRefresh,
            ...(replaceableCatalog?.kind === 'catalog'
              ? {
                  replaceableCatalog: {
                    catalog: replaceableCatalog.catalog,
                    commit: replaceableCatalog.commit,
                  },
                }
              : {}),
          }),
          parsed.json,
        ),
      )
      return 0
    }
    if (parsed.kind === 'catalog-uninstall') {
      console.log(
        formatInstalledExtension(
          'Uninstalled',
          await catalogs.uninstall(parsed.extension),
          parsed.json,
        ),
      )
      return 0
    }
    const directTarget =
      parsed.kind === 'direct-install'
        ? parseDirectExtensionTarget(parsed.sourceKind, parsed.target, {
            cwd: process.cwd(),
            validatePackageTarget: validateDirectPackageTarget,
          })
        : undefined
    if (parsed.kind === 'direct-install' || parsed.kind === 'direct-update') {
      console.error(
        'Trust notice: this command acquires and executes third-party Extension code in-process; validation is not a sandbox.',
      )
    }
    const localOAuthAppIdentities = readLocalOAuthAppIdentities()
    const loaded = await loadCliDefinitions({ localOAuthAppIdentities })
    printExtensionDiagnostics(loaded.diagnostics)
    if (parsed.kind === 'direct-install') {
      if (directTarget === undefined) {
        throw new TypeError('Direct Extension target was not parsed')
      }
      const result = await direct.install({
        target: directTarget,
        extensionId: parsed.extensionId,
        registry: loaded.registry,
        localOAuthAppIdentities,
      })
      console.log(
        formatDirectExtension(
          'Installed',
          projectDirectExtensionRecord(result),
          parsed.json,
        ),
      )
      return 0
    }
    if (parsed.kind === 'direct-update') {
      const result = await direct.update({
        extensionId: parsed.extensionId,
        registry: loaded.registry,
        localOAuthAppIdentities,
        alternateOriginAvailable: loaded.provenance.some(
          (entry) => entry.id === parsed.extensionId && entry.kind !== 'direct',
        ),
      })
      console.log(
        formatDirectExtension(
          'Updated',
          projectDirectExtensionRecord(result),
          parsed.json,
        ),
      )
      return 0
    }
    console.log(
      formatDirectExtensionUninstall(
        await direct.uninstall({
          extensionId: parsed.extensionId,
          registry: loaded.registry,
          sources: readDirectExtensionSourceBindings(),
          alternateOriginAvailable: loaded.provenance.some(
            (entry) =>
              entry.id === parsed.extensionId && entry.kind !== 'direct',
          ),
          force: parsed.force,
        }),
        parsed.json,
      ),
    )
    return 0
  } catch (error) {
    console.error(safeExtensionDiagnostic(error, 'Extension command failed'))
    return mapErrorToExit(error)
  }
}
