import { expect, spyOn, test } from 'bun:test'
import type {
  DirectExtensionInventoryEntry,
  DirectExtensionService,
  GenericExtensionInstallationRecord,
} from '@ctxindex/core'
import type {
  BuildCatalogSnapshotInput,
  CatalogRecord,
  MarketplaceExtension,
} from '@ctxindex/core/catalog'
import * as extensionRuntime from '@ctxindex/core/extension'
import { createExtensionRegistry } from '@ctxindex/core/registry'
import type { CliDefinitions } from '../definitions'
import { PrototypeUnsupportedError } from '../direct-database'
import {
  handleExtensionsCommand,
  runWithSigintCancellation,
} from './handle-extensions-command'
import type { ExtensionCommandServices } from './services'

const digest = 'b'.repeat(64)

function emptyDefinitions(): CliDefinitions {
  const registry = createExtensionRegistry([])
  return {
    roots: [],
    registry,
    completeRegistry: {
      extensions: new Map(),
      providers: new Map(),
      oauthApps: new Map(),
      profiles: new Map(),
      adapters: new Map(),
      provenances: new Map(),
    },
    diagnostics: [],
    provenance: [],
    documentation: { list: () => [], get: () => undefined },
    config: {
      extensions: { paths: [] },
      secrets: { backend: 'file' },
      log: {
        level: 'info',
        file: { rotate: 'daily', retain_days: 1, compress: false },
      },
    },
    description: { kinds: [], sources: [], actions: [] },
  }
}

const entry = {
  id: 'fixture.extension',
  summary: 'Fixture Extension',
  source: {
    kind: 'package' as const,
    replay: {
      source: {
        kind: 'npm' as const,
        requestedTarget: '@fixture/extension@^1',
        package: '@fixture/extension',
        version: '1.2.3',
        integrity: 'sha512-fixture',
      },
      packageRoot: 'node_modules/@fixture/extension',
      materializationDigest: digest,
      lock: {
        format: 'bun.lock@1.3.14' as const,
        path: 'ctxindex-resolutions/fixture.json',
        digest,
        byteLength: 10,
      },
    },
  },
}

const catalog: CatalogRecord = {
  name: 'fixture',
  repository: '/tmp/fixture.git',
  ref: 'refs/heads/main',
  commit: 'a'.repeat(40),
  snapshot_acquired_at: 1_000,
  catalog_id: 'fixture.catalog',
  catalog_label: 'Fixture Catalog',
  generated: { packageName: '@fixture/catalog', packageVersion: '1.0.0' },
  extensions: [entry],
}

const installed: GenericExtensionInstallationRecord = {
  id: 'fixture.extension',
  source: {
    kind: 'npm',
    requested_target: '@fixture/extension@^1',
    package: '@fixture/extension',
    exact_version: '1.2.3',
    integrity: 'sha512-fixture',
  },
  dependency_resolution: { format: 'bun.lock@1.3.14', digest },
  materialization_digest: digest,
  package_root: 'node_modules/@fixture/extension',
  installed_at: 1_000,
  updated_at: 1_000,
  curation: {
    extension_id: 'fixture.extension',
    catalog_name: 'fixture',
    catalog_id: 'fixture.catalog',
    repository: '/tmp/fixture.git',
    commit: 'a'.repeat(40),
    snapshot_acquired_at: 1_000,
    source_locator: { kind: 'package', entryIndex: 0 },
    execution_materialization_digest: digest,
  },
}

function unexpected(name: string): never {
  throw new Error(`Unexpected ${name}`)
}

function services(
  overrides: Partial<ExtensionCommandServices> = {},
): ExtensionCommandServices {
  return {
    catalogs: {
      add: async () => unexpected('Catalog add'),
      list: async () => unexpected('Catalog list'),
      show: async () => unexpected('Catalog show'),
      showExtension: async () => unexpected('Catalog Extension show'),
      search: async () => unexpected('Marketplace search'),
      refresh: async () => unexpected('Catalog refresh'),
      remove: async () => unexpected('Catalog remove'),
    } as unknown as ExtensionCommandServices['catalogs'],
    catalogInstallation: {
      install: async () => unexpected('Catalog install'),
    } as unknown as ExtensionCommandServices['catalogInstallation'],
    lifecycle: {
      update: async () => unexpected('Extension update'),
    } as unknown as ExtensionCommandServices['lifecycle'],
    genericInstaller: {} as ExtensionCommandServices['genericInstaller'],
    direct: {
      list: async () => [],
      install: async () => unexpected('direct install'),
      update: async () => unexpected('direct update'),
      uninstall: async () => unexpected('uninstall'),
    } as unknown as DirectExtensionService,
    buildCatalogSnapshot: async () => unexpected('Catalog build'),
    loadDefinitions: async () => emptyDefinitions(),
    readOAuthAppIdentities: async () => [],
    readSourceBindings: async () => [],
    ...overrides,
  }
}

test('does not export host diagnostic marker APIs', () => {
  expect(Object.keys(extensionRuntime)).not.toContain(
    'createExtensionHostDiagnostic',
  )
  expect(Object.keys(extensionRuntime)).not.toContain(
    'isExtensionHostDiagnostic',
  )
})

test('Catalog build prints trust notice, uses the default output, and forwards cancellation', async () => {
  let received: BuildCatalogSnapshotInput | undefined
  const output = spyOn(console, 'log').mockImplementation(() => {})
  const error = spyOn(console, 'error').mockImplementation(() => {})
  try {
    const exit = await handleExtensionsCommand(
      {
        kind: 'catalog-build',
        packageRoot: '/tmp/catalog',
        trust: true,
        json: true,
      },
      services({
        buildCatalogSnapshot: async (input) => {
          received = input
          return {
            changed: true,
            outputPath: '/tmp/catalog/ctxindex-catalog.json',
            manifest: {
              schemaVersion: 2,
              catalog: { id: 'fixture.catalog', label: 'Fixture Catalog' },
              generated: catalog.generated,
              extensions: catalog.extensions,
            },
          }
        },
      }),
    )

    expect(exit).toBe(0)
    expect(received).toMatchObject({
      packageRoot: '/tmp/catalog',
      outputPath: 'ctxindex-catalog.json',
      trusted: true,
    })
    expect(received?.installer).toBeDefined()
    expect(received?.signal).toBeInstanceOf(AbortSignal)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Trust notice'))
    expect(output).toHaveBeenCalledTimes(1)
  } finally {
    output.mockRestore()
    error.mockRestore()
  }
})

test('Marketplace search maps stored refresh policy without falling through', async () => {
  const calls: unknown[] = []
  const rows: MarketplaceExtension[] = [
    {
      id: entry.id,
      summary: entry.summary,
      catalogName: catalog.name,
      catalogId: catalog.catalog_id,
      catalogLabel: catalog.catalog_label,
      repository: catalog.repository,
      commit: catalog.commit,
      snapshotAcquiredAt: catalog.snapshot_acquired_at,
      snapshotAgeMs: 500,
      entryIndex: 0,
      sourceKind: 'package',
      sourceLocator: { kind: 'package', entryIndex: 0 },
      entry,
    },
  ]
  const output = spyOn(console, 'log').mockImplementation(() => {})
  try {
    const freshExit = await handleExtensionsCommand(
      {
        kind: 'catalog-search',
        query: 'fixture',
        noRefresh: false,
        json: true,
      },
      services({
        catalogs: {
          search: async (...args: unknown[]) => {
            calls.push(args)
            return rows
          },
        } as unknown as ExtensionCommandServices['catalogs'],
      }),
    )
    const storedExit = await handleExtensionsCommand(
      {
        kind: 'catalog-search',
        query: 'fixture',
        noRefresh: true,
        json: true,
      },
      services({
        catalogs: {
          search: async (...args: unknown[]) => {
            calls.push(args)
            return rows
          },
        } as unknown as ExtensionCommandServices['catalogs'],
      }),
    )

    expect(freshExit).toBe(0)
    expect(storedExit).toBe(0)
    expect(calls).toEqual([
      ['fixture', { refresh: true }],
      ['fixture', { refresh: false }],
    ])
    expect(JSON.parse(String(output.mock.calls[1]?.[0]))).toMatchObject([
      { id: 'fixture.extension', snapshotAgeMs: 500 },
    ])
  } finally {
    output.mockRestore()
  }
})

test('Catalog show uses a versionless selector and maps default refresh', async () => {
  const calls: unknown[] = []
  const output = spyOn(console, 'log').mockImplementation(() => {})
  try {
    const exit = await handleExtensionsCommand(
      {
        kind: 'catalog-show',
        name: 'fixture',
        extensionId: 'fixture.extension',
        noRefresh: false,
        json: true,
      },
      services({
        catalogs: {
          showExtension: async (...args: unknown[]) => {
            calls.push(args)
            return { catalog, extension: entry }
          },
        } as unknown as ExtensionCommandServices['catalogs'],
      }),
    )

    expect(exit).toBe(0)
    expect(calls).toEqual([['fixture', 'fixture.extension', { refresh: true }]])
  } finally {
    output.mockRestore()
  }
})

test('Catalog install invocation grants trust and delegates refresh policy without eager definition loading', async () => {
  let received: unknown
  let definitionLoads = 0
  const output = spyOn(console, 'log').mockImplementation(() => {})
  const error = spyOn(console, 'error').mockImplementation(() => {})
  try {
    const exit = await handleExtensionsCommand(
      {
        kind: 'install',
        sourceKind: 'catalog',
        target: 'fixture',
        extensionId: 'fixture.extension',
        noRefresh: true,
        json: false,
      },
      services({
        catalogInstallation: {
          install: async (input: unknown) => {
            received = input
            return installed
          },
        } as ExtensionCommandServices['catalogInstallation'],
        loadDefinitions: async () => {
          definitionLoads += 1
          return emptyDefinitions()
        },
      }),
    )

    expect(exit).toBe(0)
    expect(received).toMatchObject({
      catalog: 'fixture',
      extensionId: 'fixture.extension',
      noRefresh: true,
    })
    expect((received as { signal?: unknown }).signal).toBeInstanceOf(
      AbortSignal,
    )
    expect(definitionLoads).toBe(0)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Trust notice'))
    expect(error).toHaveBeenCalledTimes(1)
  } finally {
    output.mockRestore()
    error.mockRestore()
  }
})

test('update delegates to the origin-neutral lifecycle and preserves Catalog provenance output', async () => {
  let received: unknown
  const output = spyOn(console, 'log').mockImplementation(() => {})
  const error = spyOn(console, 'error').mockImplementation(() => {})
  try {
    const exit = await handleExtensionsCommand(
      {
        kind: 'update',
        extensionId: installed.id,
        json: true,
      },
      services({
        lifecycle: {
          update: async (input: unknown) => {
            received = input
            return installed
          },
        } as ExtensionCommandServices['lifecycle'],
      }),
    )

    expect(exit).toBe(0)
    expect(received).toMatchObject({ extensionId: installed.id })
    expect((received as { signal?: unknown }).signal).toBeInstanceOf(
      AbortSignal,
    )
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Trust notice'))
    expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({
      action: 'updated',
      id: installed.id,
      curation: { catalog_name: 'fixture' },
    })
  } finally {
    output.mockRestore()
    error.mockRestore()
  }
})

test('direct install rejects Catalog-only --no-refresh before acquisition or trust notice', async () => {
  let calls = 0
  const error = spyOn(console, 'error').mockImplementation(() => {})
  try {
    const exit = await handleExtensionsCommand(
      {
        kind: 'install',
        sourceKind: 'npm',
        target: '@fixture/extension@^1',
        extensionId: installed.id,
        noRefresh: true,
        json: false,
      },
      services({
        direct: {
          install: async () => {
            calls += 1
            return installed
          },
        } as unknown as DirectExtensionService,
      }),
    )

    expect(exit).toBe(2)
    expect(calls).toBe(0)
    expect(error).not.toHaveBeenCalledWith(
      expect.stringContaining('Trust notice'),
    )
  } finally {
    error.mockRestore()
  }
})

test('origin-neutral uninstall always delegates to DirectExtensionService', async () => {
  let input: unknown
  const inventory: DirectExtensionInventoryEntry = {
    id: 'fixture.extension',
    sourceKind: 'npm',
    requestedTarget: '@fixture/extension@^1',
    resolvedIdentity: '1.2.3',
    materializationDigest: digest,
    installedAt: 1,
    updatedAt: 1,
  }
  const output = spyOn(console, 'log').mockImplementation(() => {})
  try {
    const exit = await handleExtensionsCommand(
      {
        kind: 'uninstall',
        extensionId: 'fixture.extension',
        force: false,
        json: true,
      },
      services({
        direct: {
          uninstall: async (value: unknown) => {
            input = value
            return {
              extension: inventory,
              blockingSources: [],
              forced: false,
              dataPreserved: true,
            }
          },
        } as unknown as DirectExtensionService,
      }),
    )
    expect(exit).toBe(0)
    expect(input).toMatchObject({
      extensionId: 'fixture.extension',
      force: false,
    })
  } finally {
    output.mockRestore()
  }
})

test('direct install keeps explicit target parsing and reloadable validation context', async () => {
  let received: {
    readonly target?: unknown
    readonly extensionId?: string
    readonly signal?: AbortSignal
  } = {}
  let validationLoads = 0
  const { curation: _curation, ...directRecord } = installed
  const output = spyOn(console, 'log').mockImplementation(() => {})
  const error = spyOn(console, 'error').mockImplementation(() => {})
  try {
    const exit = await handleExtensionsCommand(
      {
        kind: 'install',
        sourceKind: 'npm',
        target: '@fixture/extension@^1',
        extensionId: 'fixture.extension',
        noRefresh: false,
        json: false,
      },
      services({
        direct: {
          install: async (input: {
            readonly target: unknown
            readonly extensionId: string
            readonly signal?: AbortSignal
            readonly loadValidationContext: () => Promise<unknown>
          }) => {
            received = input
            await input.loadValidationContext()
            return directRecord
          },
        } as unknown as DirectExtensionService,
        loadDefinitions: async () => {
          validationLoads += 1
          return emptyDefinitions()
        },
      }),
    )

    expect(exit).toBe(0)
    expect(received).toMatchObject({
      target: {
        kind: 'npm',
        requestedTarget: '@fixture/extension@^1',
      },
      extensionId: 'fixture.extension',
    })
    expect(received.signal).toBeInstanceOf(AbortSignal)
    expect(validationLoads).toBe(1)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Trust notice'))
    expect(error).toHaveBeenCalledTimes(1)
  } finally {
    output.mockRestore()
    error.mockRestore()
  }
})

test('database ownership conflict remains actionable and exits 50', async () => {
  const error = spyOn(console, 'error').mockImplementation(() => {})
  try {
    const exit = await handleExtensionsCommand(
      { kind: 'catalog-list', noRefresh: true, json: false },
      services({
        catalogs: {
          list: async () => {
            throw new PrototypeUnsupportedError()
          },
        } as unknown as ExtensionCommandServices['catalogs'],
      }),
    )
    expect(exit).toBe(50)
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('unavailable while the local daemon owns'),
    )
  } finally {
    error.mockRestore()
  }
})

test('SIGINT cancellation listener is removed after the lifecycle settles', async () => {
  const before = process.listenerCount('SIGINT')
  await runWithSigintCancellation(async (signal) => {
    expect(signal.aborted).toBe(false)
  })
  expect(process.listenerCount('SIGINT')).toBe(before)
})
