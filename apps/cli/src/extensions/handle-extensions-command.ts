import { CatalogService } from '@ctxindex/core/catalog'
import { safeExtensionDiagnostic } from '@ctxindex/core/extension'
import { parseExtensionsArgs } from '../args/extensions'
import { loadCliDefinitions, printExtensionDiagnostics } from '../definitions'
import {
  PrototypeUnsupportedError,
  readLeasedLocalOAuthAppIdentities,
} from '../direct-database'
import {
  formatCatalog,
  formatCatalogExtension,
  formatCatalogs,
  formatInstalledExtension,
} from '../format/catalog'
import { mapErrorToExit } from '../format/exit'
import { formatExtensions } from '../format/registry'

export async function handleExtensionsCommand(
  args: string[],
  catalogs: CatalogService = new CatalogService(),
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
    if (parsed.kind === 'install') {
      const localOAuthAppIdentities = await readLeasedLocalOAuthAppIdentities()
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
    console.log(
      formatInstalledExtension(
        'Uninstalled',
        await catalogs.uninstall(parsed.extension),
        parsed.json,
      ),
    )
    return 0
  } catch (error) {
    console.error(
      error instanceof PrototypeUnsupportedError
        ? error.message
        : safeExtensionDiagnostic(error, 'Extension command failed'),
    )
    return mapErrorToExit(error)
  }
}
