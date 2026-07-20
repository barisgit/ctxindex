import { join } from 'node:path'
import {
  BunPackageMaterializer,
  DirectExtensionService,
  DirectExtensionStore,
  parseDirectExtensionTarget,
  projectDirectExtensionRecord,
  validateDirectExtensionId,
  validateDirectPackageTarget,
} from '@ctxindex/core'
import { CatalogService } from '@ctxindex/core/catalog'
import { safeExtensionDiagnostic } from '@ctxindex/core/extension'
import { dataDir } from '@ctxindex/core/paths'
import { parseExtensionsArgs } from '../args/extensions'
import { loadCliDefinitions, printExtensionDiagnostics } from '../definitions'
import {
  PrototypeUnsupportedError,
  readLeasedDirectExtensionSourceBindings,
  readLeasedLocalOAuthAppIdentities,
} from '../direct-database'
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

export async function runWithSigintCancellation<T>(
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  process.once('SIGINT', cancel)
  try {
    return await operation(controller.signal)
  } finally {
    process.removeListener('SIGINT', cancel)
  }
}

export async function handleExtensionsCommand(
  args: string[],
  catalogs: CatalogService = new CatalogService(),
  direct: DirectExtensionService = createDirectExtensionService(),
  loadDefinitions: typeof loadCliDefinitions = loadCliDefinitions,
  readOAuthAppIdentities: typeof readLeasedLocalOAuthAppIdentities = readLeasedLocalOAuthAppIdentities,
  readSourceBindings: typeof readLeasedDirectExtensionSourceBindings = readLeasedDirectExtensionSourceBindings,
): Promise<number> {
  const parsed = parseExtensionsArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(parsed.message)
    return 2
  }
  try {
    if (parsed.kind === 'list') {
      const loaded = await loadDefinitions()
      printExtensionDiagnostics(loaded.diagnostics)
      console.log(
        formatExtensions(
          loaded.registry,
          parsed.json,
          loaded.provenance,
          await direct.list(),
        ),
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
      const localOAuthAppIdentities = await readOAuthAppIdentities()
      const loaded = await loadDefinitions({ localOAuthAppIdentities })
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
    validateDirectExtensionId(parsed.extensionId)
    if (parsed.kind === 'direct-install' || parsed.kind === 'direct-update') {
      console.error(
        'Trust notice: this command acquires and executes third-party Extension code in-process; validation is not a sandbox.',
      )
    }
    const localOAuthAppIdentities = await readOAuthAppIdentities()
    const loaded = await loadDefinitions({ localOAuthAppIdentities })
    printExtensionDiagnostics(loaded.diagnostics)
    if (parsed.kind === 'direct-install') {
      if (directTarget === undefined) {
        throw new TypeError('Direct Extension target was not parsed')
      }
      const result = await runWithSigintCancellation((signal) =>
        direct.install({
          target: directTarget,
          extensionId: parsed.extensionId,
          loadValidationContext: async () => {
            const freshLocalOAuthAppIdentities = await readOAuthAppIdentities()
            const fresh = await loadDefinitions({
              localOAuthAppIdentities: freshLocalOAuthAppIdentities,
            })
            return {
              registry: fresh.registry,
              roots: fresh.roots,
              localOAuthAppIdentities: freshLocalOAuthAppIdentities,
            }
          },
          signal,
        }),
      )
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
      const result = await runWithSigintCancellation((signal) =>
        direct.update({
          extensionId: parsed.extensionId,
          loadValidationContext: async () => {
            const freshLocalOAuthAppIdentities = await readOAuthAppIdentities()
            const fresh = await loadDefinitions({
              localOAuthAppIdentities: freshLocalOAuthAppIdentities,
            })
            return {
              registry: fresh.registry,
              roots: fresh.roots,
              localOAuthAppIdentities: freshLocalOAuthAppIdentities,
              alternateOriginAvailable: fresh.provenance.some(
                (entry) =>
                  entry.id === parsed.extensionId && entry.kind !== 'direct',
              ),
            }
          },
          signal,
        }),
      )
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
          loadValidationContext: async () => {
            const freshLocalOAuthAppIdentities = await readOAuthAppIdentities()
            const fresh = await loadDefinitions({
              localOAuthAppIdentities: freshLocalOAuthAppIdentities,
            })
            return {
              registry: fresh.registry,
              roots: fresh.roots,
              localOAuthAppIdentities: freshLocalOAuthAppIdentities,
              alternateOriginAvailable: fresh.provenance.some(
                (entry) =>
                  entry.id === parsed.extensionId && entry.kind !== 'direct',
              ),
              sources: await readSourceBindings(),
            }
          },
          force: parsed.force,
        }),
        parsed.json,
      ),
    )
    return 0
  } catch (error) {
    const caught = error ?? {}
    const code = (caught as { code?: unknown }).code
    if (caught instanceof PrototypeUnsupportedError) {
      console.error(caught.message)
      return mapErrorToExit(caught)
    }
    if (
      caught instanceof Error &&
      typeof code === 'string' &&
      code.startsWith('extension_')
    ) {
      console.error(`${code}: ${caught.message}`)
    } else {
      const diagnostic = safeExtensionDiagnostic(
        caught,
        'Extension command failed',
      )
      console.error(
        typeof code === 'string' && /^[a-z0-9_]+$/.test(code)
          ? `${diagnostic} (${code})`
          : diagnostic,
      )
    }
    return mapErrorToExit(caught)
  }
}
