import { expect, spyOn, test } from 'bun:test'
import type { CatalogService } from '@ctxindex/core/catalog'
import * as extensionRuntime from '@ctxindex/core/extension'
import { PrototypeUnsupportedError } from '../direct-database'
import { handleExtensionsCommand } from './handle-extensions-command'

test('does not export host diagnostic marker APIs', () => {
  expect(Object.keys(extensionRuntime)).not.toContain(
    'createExtensionHostDiagnostic',
  )
  expect(Object.keys(extensionRuntime)).not.toContain(
    'isExtensionHostDiagnostic',
  )
})

test('database ownership conflict remains actionable and exits 50', async () => {
  const error = spyOn(console, 'error').mockImplementation(() => {})
  const catalogs = {
    list: async () => {
      throw new PrototypeUnsupportedError()
    },
  } as unknown as CatalogService
  try {
    const exitCode = await handleExtensionsCommand(
      ['catalog', 'list', '--no-refresh'],
      catalogs,
    )
    expect(exitCode).toBe(50)
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('unavailable while the local daemon owns'),
    )
  } finally {
    error.mockRestore()
  }
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
