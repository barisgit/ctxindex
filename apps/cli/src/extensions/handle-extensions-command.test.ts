import { expect, spyOn, test } from 'bun:test'
import type { DirectExtensionService } from '@ctxindex/core'
import type { CatalogService } from '@ctxindex/core/catalog'
import * as extensionRuntime from '@ctxindex/core/extension'
import { createExtensionRegistry } from '@ctxindex/core/registry'
import type { CliDefinitions } from '../definitions'
import {
  handleExtensionsCommand,
  runWithSigintCancellation,
} from './handle-extensions-command'

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

test('does not export host diagnostic marker APIs', () => {
  expect(Object.keys(extensionRuntime)).not.toContain(
    'createExtensionHostDiagnostic',
  )
  expect(Object.keys(extensionRuntime)).not.toContain(
    'isExtensionHostDiagnostic',
  )
})

test('collapses arbitrary injected Catalog service failures', async () => {
  const error = spyOn(console, 'error').mockImplementation(() => {})
  const catalogs = {
    list: async () => {
      throw new Error('orchid-river-742')
    },
  } as unknown as CatalogService
  try {
    const exitCode = await handleExtensionsCommand(
      ['catalog', 'list', '--no-refresh'],
      catalogs,
    )

    expect(exitCode).toBe(50)
    expect(error).toHaveBeenCalledWith('Extension command failed')
    expect(error).not.toHaveBeenCalledWith(
      expect.stringContaining('orchid-river-742'),
    )
  } finally {
    error.mockRestore()
  }
})

test('direct install wires SIGINT cancellation into the Core lifecycle call', async () => {
  let received: AbortSignal | undefined
  const direct = {
    install: async (input: { readonly signal?: AbortSignal }) => {
      received = input.signal
      process.emit('SIGINT')
      throw Object.assign(new Error('cancelled'), {
        code: 'cancelled',
        exitCode: 130,
      })
    },
  } as unknown as DirectExtensionService
  const error = spyOn(console, 'error').mockImplementation(() => {})
  try {
    const exitCode = await handleExtensionsCommand(
      ['install', 'npm', '@example/direct@1', '--extension', 'example.direct'],
      {} as CatalogService,
      direct,
      async () => emptyDefinitions(),
      () => [],
      () => [],
    )
    expect(exitCode).toBe(130)
    expect(received?.aborted).toBe(true)
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
