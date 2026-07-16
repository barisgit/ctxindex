import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'

const adapterRoot = new URL('../../packages/adapters/src/', import.meta.url)

function isProductionTypeScript(name: string): boolean {
  return name.endsWith('.ts') && !name.endsWith('.test.ts')
}

test('built-in Source Adapter implementation is owned by provider modules', async () => {
  const rootFiles = (await readdir(adapterRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && isProductionTypeScript(entry.name))
    .map((entry) => entry.name)
    .sort()

  expect(rootFiles).toEqual(['builtins.ts', 'index.ts'])

  const googleFiles = (await readdir(new URL('google-mailbox/', adapterRoot)))
    .filter(isProductionTypeScript)
    .sort()
  expect(googleFiles).toContain('config.ts')
  expect(googleFiles).toContain('definition.ts')

  const localFiles = (await readdir(new URL('local-directory/', adapterRoot)))
    .filter(isProductionTypeScript)
    .sort()
  expect(localFiles).toContain('definition.ts')
})

test('built-in Extension root composes definitions without owning Adapter behavior', async () => {
  const source = await Bun.file(new URL('builtins.ts', adapterRoot)).text()

  expect(source).toContain("from './google-mailbox/definition'")
  expect(source).toContain("from './local-directory/definition'")
  expect(source).not.toMatch(
    /defineAdapter|\bconfigSchema\b|\boperations\b|\bactions\b/,
  )
  expect(source).not.toContain("from 'zod'")
})

const sdkRoot = new URL('../../packages/extension-sdk/src/', import.meta.url)

test('public Extension SDK is a stable barrel over core-independent modules', async () => {
  const entries = await readdir(sdkRoot, { withFileTypes: true })
  const productionFiles = entries
    .filter((entry) => entry.isFile() && isProductionTypeScript(entry.name))
    .map((entry) => entry.name)
    .sort()

  expect(productionFiles).toEqual([
    'adapter.ts',
    'extension.ts',
    'index.ts',
    'operations.ts',
    'profile.ts',
    'reference.ts',
  ])

  for (const filename of productionFiles) {
    const source = await Bun.file(new URL(filename, sdkRoot)).text()
    expect(source).not.toContain('@ctxindex/core')
  }

  const publicIndex = await Bun.file(new URL('index.ts', sdkRoot)).text()
  expect(publicIndex).not.toMatch(/export (?:interface|function|class|const)\b/)
})

const formatRoot = new URL('../../apps/cli/src/format/', import.meta.url)

test('registry presentation is split behind a declaration-free facade', async () => {
  const productionFiles = (await readdir(formatRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && isProductionTypeScript(entry.name))
    .map((entry) => entry.name)

  expect(productionFiles).toEqual(
    expect.arrayContaining([
      'registry-markdown.ts',
      'registry-projection.ts',
      'registry-schema.ts',
      'registry-text.ts',
      'registry.ts',
    ]),
  )

  const facade = await Bun.file(new URL('registry.ts', formatRoot)).text()
  expect(facade).not.toMatch(/^(?:export )?(?:async )?function\b/m)
  expect(facade.split('\n').length).toBeLessThanOrEqual(40)
})

const coreSourceRoot = new URL('../../packages/core/src/', import.meta.url)

test('core Source removal uses declared generic cascades without prototype paths', async () => {
  expect(
    await Bun.file(new URL('sync/operations.ts', coreSourceRoot)).exists(),
  ).toBe(false)

  const sourceService = await Bun.file(
    new URL('source/service.ts', coreSourceRoot),
  ).text()
  expect(sourceService).not.toContain('sqlite_master')
  expect(sourceService).not.toContain('foreign_key_list')
  expect(sourceService).not.toContain('adapter-owned')
})

test('logger Interface delegates redaction and rotation implementation', async () => {
  const loggerRoot = new URL('logger/', coreSourceRoot)
  expect(await Bun.file(new URL('redaction.ts', loggerRoot)).exists()).toBe(
    true,
  )
  expect(await Bun.file(new URL('rotation.ts', loggerRoot)).exists()).toBe(true)

  const loggerIndex = await Bun.file(new URL('index.ts', loggerRoot)).text()
  expect(loggerIndex).not.toContain("from 'node:fs")
  expect(loggerIndex).not.toContain("from 'node:zlib'")
  expect(loggerIndex).not.toContain("from 'pino-roll'")
  expect(loggerIndex.split('\n').length).toBeLessThanOrEqual(150)
})

test('core subpaths target capability indexes without root shims', async () => {
  const packageJson = await Bun.file(
    new URL('../package.json', coreSourceRoot),
  ).json()
  const expected = {
    './config': './src/config/index.ts',
    './logger': './src/logger/index.ts',
    './paths': './src/paths/index.ts',
    './registry': './src/registry/index.ts',
    './schema': './src/schema/index.ts',
    './search': './src/search/index.ts',
    './secrets': './src/secrets/index.ts',
    './storage': './src/storage/index.ts',
    './sync': './src/sync/index.ts',
  }
  for (const [subpath, target] of Object.entries(expected)) {
    expect(packageJson.exports[subpath]).toBe(target)
  }

  for (const shim of [
    'config.ts',
    'logger.ts',
    'paths.ts',
    'registry.ts',
    'schema.ts',
    'search.ts',
    'secrets.ts',
    'storage.ts',
    'sync.ts',
  ]) {
    expect(await Bun.file(new URL(shim, coreSourceRoot)).exists(), shim).toBe(
      false,
    )
  }

  expect(
    await Bun.file(
      new URL('../../scripts/verify/agent-howtos.test.ts', import.meta.url),
    ).exists(),
  ).toBe(true)
  expect(
    await Bun.file(
      new URL('meta/agent-howtos.test.ts', coreSourceRoot),
    ).exists(),
  ).toBe(false)
})

test('secret backend selection has one explicit owner and no literal-secret CLI', async () => {
  const cliRoot = new URL('../../apps/cli/src/', import.meta.url)
  const deps = await Bun.file(new URL('deps.ts', cliRoot)).text()
  expect(deps).not.toContain('loadWritableSecretsStore')
  expect(deps).not.toMatch(/backend_unavailable[\s\S]{0,500}new FileBackend/)

  const secretCli = (
    await Promise.all(
      ['args/secrets.ts', 'commands/secrets.ts'].map((path) =>
        Bun.file(new URL(path, cliRoot)).text(),
      ),
    )
  ).join('\n')
  expect(secretCli).not.toMatch(/passphrase|secrets migrate/)

  const configSchema = await Bun.file(
    new URL('config/schema.ts', coreSourceRoot),
  ).text()
  expect(configSchema).not.toContain('passphrase_env')
  expect(
    await Bun.file(new URL('secrets/service.ts', coreSourceRoot)).exists(),
  ).toBe(false)

  const keychain = await Bun.file(
    new URL('secrets/keychain.ts', coreSourceRoot),
  ).text()
  expect(keychain).toContain("process.env.NODE_ENV === 'test'")
  expect(keychain).toContain('CTXINDEX_KEYTAR_MOCK_FILE')
})
