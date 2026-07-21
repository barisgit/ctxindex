import { describe, expect, test } from 'bun:test'
import {
  evaluateLibraryPublishPreflight,
  evaluateLibraryRelease,
  type LibraryGateInput,
  parseLibraryReleaseMatrix,
} from '../../../scripts/release/library-release-gate'

const definition = {
  id: 'extension-sdk',
  packageName: '@ctxindex/extension-sdk',
  manifestPath: 'packages/extension-sdk/package.json',
  prepareScript: 'prepare:extension-sdk-release',
  archivePrefix: 'ctxindex-extension-sdk',
} as const

function integrityFor(value: string): string {
  return `sha512-${new Bun.CryptoHasher('sha512')
    .update(value)
    .digest('base64')}`
}

const archiveIntegrity = integrityFor('archive')

function input(overrides: Partial<LibraryGateInput> = {}): LibraryGateInput {
  return {
    definition,
    previousVersion: '0.1.0',
    currentVersion: '0.1.1',
    registry: { status: 404 },
    ...overrides,
  }
}

describe('library release gate', () => {
  test('skips an unchanged package without a registry result', () => {
    expect(
      evaluateLibraryRelease(
        input({
          currentVersion: '0.1.0',
          registry: undefined,
        }),
      ),
    ).toBeNull()
  })

  test('selects a changed unpublished package independently', () => {
    expect(evaluateLibraryRelease(input())).toEqual({
      id: 'extension-sdk',
      packageName: '@ctxindex/extension-sdk',
      version: '0.1.1',
      prepareScript: 'prepare:extension-sdk-release',
      archive: 'dist/npm/artifacts/ctxindex-extension-sdk-0.1.1.tgz',
      archiveName: 'ctxindex-extension-sdk-0.1.1.tgz',
    })
  })

  test('keeps a changed published package for artifact integrity verification', () => {
    expect(
      evaluateLibraryRelease(
        input({
          registry: {
            status: 200,
            name: '@ctxindex/extension-sdk',
            version: '0.1.1',
            integrity: archiveIntegrity,
          },
        }),
      ),
    ).toEqual({
      id: 'extension-sdk',
      packageName: '@ctxindex/extension-sdk',
      version: '0.1.1',
      prepareScript: 'prepare:extension-sdk-release',
      archive: 'dist/npm/artifacts/ctxindex-extension-sdk-0.1.1.tgz',
      archiveName: 'ctxindex-extension-sdk-0.1.1.tgz',
    })
  })

  test.each([
    {
      name: 'unexpected status',
      registry: { status: 503 },
      error: 'registry response 503',
    },
    {
      name: 'missing registry fields',
      registry: { status: 200 },
      error: 'did not confirm exact package version',
    },
    {
      name: 'mismatched package',
      registry: { status: 200, name: '@ctxindex/profiles', version: '0.1.1' },
      error: 'did not confirm exact package version',
    },
    {
      name: 'mismatched version',
      registry: {
        status: 200,
        name: '@ctxindex/extension-sdk',
        version: '0.1.2',
        integrity: archiveIntegrity,
      },
      error: 'did not confirm exact package version',
    },
    {
      name: 'missing registry integrity',
      registry: {
        status: 200,
        name: '@ctxindex/extension-sdk',
        version: '0.1.1',
      },
      error: 'missing or malformed dist.integrity',
    },
    {
      name: 'malformed registry integrity',
      registry: {
        status: 200,
        name: '@ctxindex/extension-sdk',
        version: '0.1.1',
        integrity: 'sha512-not-base64',
      },
      error: 'missing or malformed dist.integrity',
    },
    {
      name: 'non-canonical registry integrity',
      registry: {
        status: 200,
        name: '@ctxindex/extension-sdk',
        version: '0.1.1',
        integrity: `sha512-${'A'.repeat(85)}B==`,
      },
      error: 'missing or malformed dist.integrity',
    },
  ])('fails closed for $name', ({ registry, error }) => {
    expect(() => evaluateLibraryRelease(input({ registry }))).toThrow(error)
  })

  test('rejects malformed semantic versions', () => {
    expect(() =>
      evaluateLibraryRelease(input({ currentVersion: '01.1.0' })),
    ).toThrow('valid semantic version')
  })

  test('rejects a version downgrade', () => {
    expect(() =>
      evaluateLibraryRelease(
        input({ previousVersion: '0.2.0', currentVersion: '0.1.1' }),
      ),
    ).toThrow('strictly greater')
  })

  test('accepts an ordered candidate subset and rejects reordered candidates', () => {
    const extensionSdk = evaluateLibraryRelease(input())
    const profiles = {
      id: 'profiles',
      packageName: '@ctxindex/profiles',
      version: '0.1.0',
      prepareScript: 'prepare:profiles-release',
      archive: 'dist/npm/artifacts/ctxindex-profiles-0.1.0.tgz',
      archiveName: 'ctxindex-profiles-0.1.0.tgz',
    } as const

    expect(
      parseLibraryReleaseMatrix(JSON.stringify({ include: [profiles] })),
    ).toEqual({ include: [profiles] })
    expect(() =>
      parseLibraryReleaseMatrix(
        JSON.stringify({ include: [profiles, extensionSdk] }),
      ),
    ).toThrow('dependency order')
  })

  test('continues a partial two-package retry after the exact SDK already published', () => {
    const extensionSdk = evaluateLibraryRelease(input())
    if (extensionSdk === null) throw new Error('expected SDK candidate')
    const profiles = {
      id: 'profiles',
      packageName: '@ctxindex/profiles',
      version: '0.1.0',
      prepareScript: 'prepare:profiles-release',
      archive: 'dist/npm/artifacts/ctxindex-profiles-0.1.0.tgz',
      archiveName: 'ctxindex-profiles-0.1.0.tgz',
    } as const

    expect(
      [
        {
          candidate: extensionSdk,
          registry: {
            status: 200,
            name: extensionSdk.packageName,
            version: extensionSdk.version,
            integrity: archiveIntegrity,
          },
        },
        {
          candidate: profiles,
          registry: { status: 404 },
        },
      ].map(({ candidate, registry }) =>
        evaluateLibraryPublishPreflight({
          candidate,
          registry,
          archiveIntegrity,
          runAttempt: 2,
        }),
      ),
    ).toEqual(['skip', 'publish'])
  })

  test('rejects an exact version appearing during the first attempt', () => {
    const candidate = evaluateLibraryRelease(input())
    if (candidate === null) throw new Error('expected SDK candidate')

    expect(() =>
      evaluateLibraryPublishPreflight({
        candidate,
        registry: {
          status: 200,
          name: candidate.packageName,
          version: candidate.version,
          integrity: archiveIntegrity,
        },
        archiveIntegrity,
        runAttempt: 1,
      }),
    ).toThrow('appeared before publication')
  })

  test('rejects a retry when the published and built archive integrity differ', () => {
    const candidate = evaluateLibraryRelease(input())
    if (candidate === null) throw new Error('expected SDK candidate')

    expect(() =>
      evaluateLibraryPublishPreflight({
        candidate,
        registry: {
          status: 200,
          name: candidate.packageName,
          version: candidate.version,
          integrity: archiveIntegrity,
        },
        archiveIntegrity: integrityFor('different archive'),
        runAttempt: 2,
      }),
    ).toThrow('integrity does not match')
  })

  test.each([
    ['missing', undefined],
    ['malformed', 'sha512-not-base64'],
    ['non-canonical', `sha512-${'A'.repeat(85)}B==`],
  ])('rejects %s built archive integrity', (_name, integrity) => {
    const candidate = evaluateLibraryRelease(input())
    if (candidate === null) throw new Error('expected SDK candidate')

    expect(() =>
      evaluateLibraryPublishPreflight({
        candidate,
        registry: { status: 404 },
        archiveIntegrity: integrity as string,
        runAttempt: 1,
      }),
    ).toThrow('Built archive integrity is malformed')
  })
})
