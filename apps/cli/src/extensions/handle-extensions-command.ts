import {
  parseDirectExtensionTarget,
  projectDirectExtensionRecord,
  validateDirectExtensionId,
  validateDirectPackageTarget,
} from '@ctxindex/core'
import { safeExtensionDiagnostic } from '@ctxindex/core/extension'
import { printExtensionDiagnostics } from '../definitions'
import { PrototypeUnsupportedError } from '../direct-database'
import {
  formatCatalog,
  formatCatalogBuild,
  formatCatalogExtension,
  formatCatalogs,
  formatInstalledExtension,
  formatMarketplace,
} from '../format/catalog'
import {
  formatDirectExtension,
  formatDirectExtensionUninstall,
} from '../format/direct-extension'
import { mapErrorToExit } from '../format/exit'
import { formatExtensions } from '../format/registry'
import {
  createExtensionCommandServices,
  type ExtensionCommandServices,
} from './services'

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

export type ExtensionCommandInput =
  | { readonly kind: 'list'; readonly json: boolean }
  | {
      readonly kind: 'catalog-build'
      readonly packageRoot: string
      readonly catalogId?: string
      readonly output?: string
      readonly trust: boolean
      readonly json: boolean
    }
  | {
      readonly kind: 'catalog-add'
      readonly name: string
      readonly repository: string
      readonly ref: string
      readonly trust: boolean
      readonly json: boolean
    }
  | {
      readonly kind: 'catalog-list'
      readonly noRefresh: boolean
      readonly json: boolean
    }
  | {
      readonly kind: 'catalog-show'
      readonly name: string
      readonly extensionId?: string
      readonly noRefresh: boolean
      readonly json: boolean
    }
  | {
      readonly kind: 'catalog-refresh'
      readonly name: string
      readonly json: boolean
    }
  | {
      readonly kind: 'catalog-remove'
      readonly name: string
      readonly json: boolean
    }
  | {
      readonly kind: 'catalog-search'
      readonly query?: string
      readonly noRefresh: boolean
      readonly json: boolean
    }
  | {
      readonly kind: 'install'
      readonly sourceKind: 'catalog' | 'npm' | 'git' | 'local'
      readonly target: string
      readonly extensionId: string
      readonly noRefresh: boolean
      readonly json: boolean
    }
  | {
      readonly kind: 'update'
      readonly extensionId: string
      readonly json: boolean
    }
  | {
      readonly kind: 'uninstall'
      readonly extensionId: string
      readonly force: boolean
      readonly json: boolean
    }

export async function handleExtensionsCommand(
  parsed: ExtensionCommandInput,
  services: ExtensionCommandServices = createExtensionCommandServices(),
): Promise<number> {
  try {
    switch (parsed.kind) {
      case 'list': {
        const loaded = await services.loadDefinitions()
        printExtensionDiagnostics(loaded.diagnostics)
        console.log(
          formatExtensions(
            loaded.registry,
            parsed.json,
            loaded.provenance,
            await services.direct.list(),
          ),
        )
        return 0
      }
      case 'catalog-build': {
        console.error(
          'Trust notice: Catalog build acquires packages and evaluates trusted author-controlled Extension code in-process; validation is not a sandbox.',
        )
        const result = await runWithSigintCancellation((signal) =>
          services.buildCatalogSnapshot({
            packageRoot: parsed.packageRoot,
            outputPath: parsed.output ?? 'ctxindex-catalog.json',
            ...(parsed.catalogId === undefined
              ? {}
              : { catalogId: parsed.catalogId }),
            trusted: parsed.trust,
            installer: services.genericInstaller,
            signal,
          }),
        )
        console.log(formatCatalogBuild(result, parsed.json))
        return 0
      }
      case 'catalog-add': {
        console.log(
          formatCatalog(
            await services.catalogs.add({
              name: parsed.name,
              repository: parsed.repository,
              ref: parsed.ref,
              trust: parsed.trust,
            }),
            parsed.json,
          ),
        )
        return 0
      }
      case 'catalog-list': {
        console.log(
          formatCatalogs(
            await services.catalogs.list({
              refresh: !parsed.noRefresh,
            }),
            parsed.json,
          ),
        )
        return 0
      }
      case 'catalog-show': {
        if (parsed.extensionId === undefined) {
          console.log(
            formatCatalog(
              await services.catalogs.show(parsed.name, {
                refresh: !parsed.noRefresh,
              }),
              parsed.json,
            ),
          )
        } else {
          const shown = await services.catalogs.showExtension(
            parsed.name,
            parsed.extensionId,
            { refresh: !parsed.noRefresh },
          )
          console.log(
            formatCatalogExtension(shown.catalog, shown.extension, parsed.json),
          )
        }
        return 0
      }
      case 'catalog-refresh': {
        console.log(
          formatCatalog(
            await services.catalogs.refresh({ name: parsed.name }),
            parsed.json,
          ),
        )
        return 0
      }
      case 'catalog-remove': {
        console.log(
          formatCatalog(
            await services.catalogs.remove(parsed.name),
            parsed.json,
          ),
        )
        return 0
      }
      case 'catalog-search': {
        console.log(
          formatMarketplace(
            await services.catalogs.search(parsed.query, {
              refresh: !parsed.noRefresh,
            }),
            parsed.json,
          ),
        )
        return 0
      }
      case 'install': {
        if (parsed.sourceKind !== 'catalog' && parsed.noRefresh) {
          console.error(
            'extension install: --no-refresh is valid only for Catalog installation',
          )
          return 2
        }
        validateDirectExtensionId(parsed.extensionId)
        console.error(
          'Trust notice: this command acquires and executes third-party Extension code in-process; validation is not a sandbox.',
        )
        if (parsed.sourceKind === 'catalog') {
          const installed = await runWithSigintCancellation((signal) =>
            services.catalogInstallation.install({
              catalog: parsed.target,
              extensionId: parsed.extensionId,
              noRefresh: parsed.noRefresh,
              signal,
            }),
          )
          console.log(
            formatInstalledExtension('Installed', installed, parsed.json),
          )
          return 0
        }
        const target = parseDirectExtensionTarget(
          parsed.sourceKind,
          parsed.target,
          {
            cwd: process.cwd(),
            validatePackageTarget: validateDirectPackageTarget,
          },
        )
        validateDirectExtensionId(parsed.extensionId)
        const installed = await runWithSigintCancellation((signal) =>
          services.direct.install({
            target,
            extensionId: parsed.extensionId,
            loadValidationContext: async () => {
              const localOAuthAppIdentities =
                await services.readOAuthAppIdentities()
              const fresh = await services.loadDefinitions({
                localOAuthAppIdentities,
              })
              return {
                registry: fresh.registry,
                roots: fresh.roots,
                localOAuthAppIdentities,
              }
            },
            signal,
          }),
        )
        console.log(
          formatDirectExtension(
            'Installed',
            projectDirectExtensionRecord(installed),
            parsed.json,
          ),
        )
        return 0
      }
      case 'update': {
        validateDirectExtensionId(parsed.extensionId)
        console.error(
          'Trust notice: this command acquires and executes third-party Extension code in-process; validation is not a sandbox.',
        )
        const updated = await runWithSigintCancellation((signal) =>
          services.lifecycle.update({
            extensionId: parsed.extensionId,
            signal,
          }),
        )
        console.log(formatInstalledExtension('Updated', updated, parsed.json))
        return 0
      }
      case 'uninstall': {
        validateDirectExtensionId(parsed.extensionId)
        console.log(
          formatDirectExtensionUninstall(
            await services.direct.uninstall({
              extensionId: parsed.extensionId,
              loadValidationContext: async () => {
                const localOAuthAppIdentities =
                  await services.readOAuthAppIdentities()
                const fresh = await services.loadDefinitions({
                  localOAuthAppIdentities,
                })
                return {
                  registry: fresh.registry,
                  roots: fresh.roots,
                  localOAuthAppIdentities,
                  alternateOriginAvailable: fresh.provenance.some(
                    (entry) =>
                      entry.id === parsed.extensionId &&
                      entry.kind !== 'direct',
                  ),
                  sources: await services.readSourceBindings(),
                }
              },
              force: parsed.force,
            }),
            parsed.json,
          ),
        )
        return 0
      }
    }
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
