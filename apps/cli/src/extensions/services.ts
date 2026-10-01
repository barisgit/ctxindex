import { join } from 'node:path'
import {
  BunPackageMaterializer,
  DirectExtensionService,
  DirectExtensionStore,
  GenericExtensionPackageInstaller,
} from '@ctxindex/core'
import {
  buildCatalogSnapshot,
  CatalogInstallationService,
  CatalogService,
  InstalledExtensionLifecycleService,
} from '@ctxindex/core/catalog'
import { dataDir } from '@ctxindex/core/paths'
import { loadCliDefinitions } from '../definitions'
import {
  readLeasedDirectExtensionSourceBindings,
  readLeasedLocalOAuthAppIdentities,
} from '../direct-database'
import {
  coordinateExtensionMutation,
  type ExtensionMutationCoordinator,
} from './daemon-coordination'

export interface ExtensionCommandServices {
  readonly catalogs: CatalogService
  readonly catalogInstallation: CatalogInstallationService
  readonly genericInstaller: GenericExtensionPackageInstaller
  readonly lifecycle: InstalledExtensionLifecycleService
  readonly direct: DirectExtensionService
  readonly buildCatalogSnapshot: typeof buildCatalogSnapshot
  readonly loadDefinitions: typeof loadCliDefinitions
  readonly readOAuthAppIdentities: typeof readLeasedLocalOAuthAppIdentities
  readonly readSourceBindings: typeof readLeasedDirectExtensionSourceBindings
  readonly coordinateMutation: ExtensionMutationCoordinator
}

export interface CreateExtensionCommandServicesOptions {
  readonly configRoot?: string
  readonly dataRoot?: string
  readonly loadDefinitions?: typeof loadCliDefinitions
  readonly readOAuthAppIdentities?: typeof readLeasedLocalOAuthAppIdentities
  readonly readSourceBindings?: typeof readLeasedDirectExtensionSourceBindings
  readonly coordinateMutation?: ExtensionMutationCoordinator
}

export function createExtensionCommandServices(
  options: CreateExtensionCommandServicesOptions = {},
): ExtensionCommandServices {
  const dataRoot = options.dataRoot ?? dataDir()
  const loadDefinitions = options.loadDefinitions ?? loadCliDefinitions
  const readOAuthAppIdentities =
    options.readOAuthAppIdentities ?? readLeasedLocalOAuthAppIdentities
  const readSourceBindings =
    options.readSourceBindings ?? readLeasedDirectExtensionSourceBindings
  const coordinateMutation =
    options.coordinateMutation ?? coordinateExtensionMutation
  const store = new DirectExtensionStore({
    ...(options.configRoot === undefined
      ? {}
      : { configRoot: options.configRoot }),
    dataRoot,
  })
  const materializer = new BunPackageMaterializer({
    stagingParent: join(dataRoot, 'direct-extensions', 'staging'),
  })
  const genericInstaller = new GenericExtensionPackageInstaller({
    store,
    materializer,
    loadActiveState: async () => {
      const localOAuthAppIdentities = await readOAuthAppIdentities()
      const loaded = await loadDefinitions({
        ...(options.configRoot === undefined
          ? {}
          : { configRoot: options.configRoot }),
        dataRoot,
        localOAuthAppIdentities,
      })
      return {
        registry: loaded.registry,
        roots: loaded.roots,
        localOAuthAppIdentities,
      }
    },
  })
  const catalogs = new CatalogService({
    ...(options.configRoot === undefined
      ? {}
      : { configRoot: options.configRoot }),
    dataRoot,
    installationRecords: store,
  })
  const catalogInstallation = new CatalogInstallationService({
    catalogs,
    installer: genericInstaller,
    dataRoot,
  })
  return {
    catalogs,
    genericInstaller,
    catalogInstallation,
    lifecycle: new InstalledExtensionLifecycleService({
      records: store,
      installer: genericInstaller,
      catalogInstallation,
    }),
    direct: new DirectExtensionService({ store, materializer }),
    buildCatalogSnapshot,
    loadDefinitions,
    readOAuthAppIdentities,
    readSourceBindings,
    coordinateMutation,
  }
}
