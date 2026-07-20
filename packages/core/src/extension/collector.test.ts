import { describe, expect, test } from 'bun:test'
import { defineExtension, defineProfile, z } from '@ctxindex/extension-sdk'
import { collectExtensionExports } from './collector'

const provenance = {
  origin: 'explicit-path' as const,
  packageName: '@ctxindex/fixture',
}

describe('collectExtensionExports', () => {
  test('collects named and default Extension values without invoking functions', () => {
    const defaultExtension = defineExtension({ id: 'fixture.default' })
    const namedExtension = defineExtension({ id: 'fixture.named' })
    const supportingProfile = defineProfile({
      id: 'fixture.note',
      version: 1,
      schema: z.object({ body: z.string() }),
    })
    let callbacks = 0
    const legacyCallback = Object.assign(
      () => {
        callbacks += 1
        return namedExtension
      },
      { kind: 'extension' as const },
    )

    const collected = collectExtensionExports(
      {
        default: defaultExtension,
        namedExtension,
        supportingProfile,
        unrelated: { value: 1 },
        legacyCallback,
      },
      '/fixture/entry.ts',
      provenance,
    )

    expect(callbacks).toBe(0)
    expect(
      collected.map(({ definition, provenance: rootProvenance }) => ({
        id: definition.id,
        entry: rootProvenance.entry,
        exportName: rootProvenance.exportName,
        packageName: rootProvenance.packageName,
        origin: rootProvenance.origin,
      })),
    ).toEqual([
      {
        id: 'fixture.default',
        entry: '/fixture/entry.ts',
        exportName: 'default',
        packageName: '@ctxindex/fixture',
        origin: 'explicit-path',
      },
      {
        id: 'fixture.named',
        entry: '/fixture/entry.ts',
        exportName: 'namedExtension',
        packageName: '@ctxindex/fixture',
        origin: 'explicit-path',
      },
    ])
  })

  test('rejects a malformed claimed Extension with export-scoped provenance', () => {
    expect(() =>
      collectExtensionExports(
        {
          forged: {
            kind: 'extension',
            id: 'fixture.forged',
            dependencies: [],
          },
        },
        '/fixture/forged.ts',
        provenance,
      ),
    ).toThrow('Invalid Extension export')
  })

  test('accepts a structurally valid Extension from another physical SDK copy', () => {
    const independentCopy = {
      kind: 'extension',
      id: 'fixture.independent-copy',
      providers: [],
      oauthApps: [],
      profiles: [],
      adapters: [],
    } as const

    expect(
      collectExtensionExports(
        { independentCopy },
        '/fixture/copy/index.js',
        provenance,
      ).map(({ definition }) => definition.id),
    ).toEqual(['fixture.independent-copy'])
  })
})
