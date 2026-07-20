import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import { CTXINDEX_BUILTIN_EXTENSIONS } from '@ctxindex/adapters'

const adapterRoot = new URL('../../packages/adapters/src/', import.meta.url)
const coreSourceRoot = new URL('../../packages/core/src/', import.meta.url)
const cliRoot = new URL('../../apps/cli/src/', import.meta.url)
const profileRoot = new URL('../../packages/profiles/src/', import.meta.url)

function isProductionTypeScript(name: string): boolean {
  return name.endsWith('.ts') && !name.endsWith('.test.ts')
}

async function productionFiles(root: URL): Promise<URL[]> {
  const files: URL[] = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const url = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, root)
    if (entry.isDirectory()) files.push(...(await productionFiles(url)))
    else if (entry.isFile() && isProductionTypeScript(entry.name))
      files.push(url)
  }
  return files
}

async function sourceTree(root: URL): Promise<string> {
  return (
    await Promise.all(
      (await productionFiles(root)).map((url) => Bun.file(url).text()),
    )
  ).join('\n')
}

test('built-in Source Adapter implementation is owned by provider modules', async () => {
  const rootFiles = (await readdir(adapterRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && isProductionTypeScript(entry.name))
    .map((entry) => entry.name)
    .sort()

  expect(rootFiles).toEqual([
    'builtins.ts',
    'google-oauth-app.ts',
    'google-oauth-provider.ts',
    'index.ts',
  ])

  const googleFiles = (await readdir(new URL('google-mailbox/', adapterRoot)))
    .filter(isProductionTypeScript)
    .sort()
  expect(googleFiles).toContain('config.ts')
  expect(googleFiles).toContain('definition.ts')

  const googleCalendarFiles = (
    await readdir(new URL('google-calendar/', adapterRoot))
  )
    .filter(isProductionTypeScript)
    .sort()
  expect(googleCalendarFiles).toEqual(
    expect.arrayContaining([
      'config.ts',
      'definition.ts',
      'event.ts',
      'response.ts',
      'retrieve.ts',
      'sync.ts',
      'url.ts',
    ]),
  )
  const builtins = await Bun.file(new URL('builtins.ts', adapterRoot)).text()
  expect(builtins).toContain("from './google-calendar/definition'")

  const microsoftMailboxFiles = (
    await readdir(new URL('microsoft/mailbox/', adapterRoot))
  )
    .filter(isProductionTypeScript)
    .sort()
  expect(microsoftMailboxFiles).toEqual(
    expect.arrayContaining([
      'config.ts',
      'definition.ts',
      'download.ts',
      'draft.ts',
      'message.ts',
      'ref.ts',
      'retrieve.ts',
      'search-remote.ts',
      'transport.ts',
    ]),
  )
  expect(builtins).toContain("from './microsoft/mailbox/definition'")

  const microsoftDirectories = (
    await readdir(new URL('microsoft/', adapterRoot), { withFileTypes: true })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  expect(microsoftDirectories).toEqual(['calendar', 'mailbox'])

  const microsoftCalendarFiles = (
    await readdir(new URL('microsoft/calendar/', adapterRoot))
  )
    .filter(isProductionTypeScript)
    .sort()
  expect(microsoftCalendarFiles).toEqual(
    expect.arrayContaining([
      'config.ts',
      'definition.ts',
      'event.ts',
      'response.ts',
      'retrieve.ts',
      'sync.ts',
    ]),
  )
  expect(builtins).toContain("from './microsoft/calendar/definition'")

  const localFiles = (await readdir(new URL('local-directory/', adapterRoot)))
    .filter(isProductionTypeScript)
    .sort()
  expect(localFiles).toContain('definition.ts')
})

test('Microsoft production surface has no send permission or route', async () => {
  const source = await sourceTree(new URL('microsoft/', adapterRoot))
  expect(source).toContain('Mail.ReadWrite')
  expect(source).toContain('Calendars.Read')
  expect(source).not.toMatch(/Mail\.Send|\/send(?:Mail)?\b|send-message/i)
  expect(source).not.toMatch(/@microsoft\/|microsoft-graph-client/i)
  expect(await sourceTree(coreSourceRoot)).not.toContain('microsoft.mailbox')
  expect(await sourceTree(coreSourceRoot)).not.toContain('microsoft.calendar')
  expect(await sourceTree(cliRoot)).not.toContain('microsoft.mailbox')
  expect(await sourceTree(cliRoot)).not.toContain('microsoft.calendar')
})

test('production Adapter surface has no send permission, Action, or route', async () => {
  expect(await sourceTree(adapterRoot)).not.toMatch(
    /Mail\.Send|gmail\.send|\/send(?:Mail)?\b|send-message/i,
  )

  const adapters = CTXINDEX_BUILTIN_EXTENSIONS.flatMap(
    (extension) => extension.adapters,
  )
  const declaredScopes = adapters.flatMap(
    (adapter) => adapter.access?.scopes ?? [],
  )
  expect(declaredScopes.filter((scope) => /send/i.test(scope))).toEqual([])

  const actionIds = [
    ...adapters.flatMap((adapter) =>
      adapter.profiles.flatMap((profile) => Object.keys(profile.actions ?? {})),
    ),
    ...adapters.flatMap((adapter) => Object.keys(adapter.actions)),
  ]
  expect([...new Set(actionIds)].sort()).toEqual([
    'communication.message.draft.create',
    'communication.message.draft.update',
  ])
  expect(actionIds.filter((id) => /send/i.test(id))).toEqual([])
})

test('Google Calendar production surface is read-only', async () => {
  const source = await sourceTree(new URL('google-calendar/', adapterRoot))
  expect(source).toContain('calendar.events.readonly')
  expect(source.replaceAll('calendar.events.readonly', '')).not.toContain(
    'calendar.events',
  )
  expect(source).not.toMatch(/\b(?:POST|PATCH|PUT|DELETE)\b/)
})

test('Microsoft Calendar production surface is stable and read-only', async () => {
  const source = await sourceTree(new URL('microsoft/calendar/', adapterRoot))
  expect(source).toContain("scopes: ['Calendars.Read']")
  expect(source).not.toMatch(
    /Calendars\.ReadWrite|\b(?:POST|PATCH|PUT|DELETE)\b/,
  )
  expect(source).not.toMatch(/\/beta\b/)
})

test('calendar vocabulary is Profile-owned and bundled declaratively', async () => {
  const profiles = await sourceTree(profileRoot)
  expect(profiles).toContain("id: 'calendar.event'")
  expect(profiles).not.toContain("aliases: ['events']")

  const calendarAdapters = await Promise.all([
    Bun.file(new URL('google-calendar/definition.ts', adapterRoot)).text(),
    Bun.file(new URL('microsoft/calendar/definition.ts', adapterRoot)).text(),
  ])
  expect(
    calendarAdapters.every((source) => source.includes('calendarEventProfile')),
  ).toBe(true)
  expect(await sourceTree(coreSourceRoot)).not.toContain('calendar.event')
})

test('provider implementation and endpoint literals stay outside core and CLI', async () => {
  const providerHostPattern =
    /accounts\.google\.com|oauth2\.googleapis\.com|www\.googleapis\.com|login\.microsoftonline\.com|graph\.microsoft\.com/i
  expect(await sourceTree(coreSourceRoot)).not.toMatch(providerHostPattern)
  expect(await sourceTree(cliRoot)).not.toMatch(providerHostPattern)
  expect(
    await Bun.file(new URL('auth/google-client.ts', coreSourceRoot)).exists(),
  ).toBe(false)
})

test('OAuth App and Account CLIs have no literal long-lived credential inputs', async () => {
  const accessSources = (
    await Promise.all(
      [
        'args/oauth-app.ts',
        'commands/oauth-app.ts',
        'args/account.ts',
        'commands/account.ts',
      ].map((path) => Bun.file(new URL(path, cliRoot)).text()),
    )
  ).join('\n')
  expect(accessSources).not.toMatch(
    /['"](?:client-id|client-secret|auth-code|refresh-token)['"]\s*:/,
  )
  expect(await Bun.file(new URL('args/auth.ts', cliRoot)).exists()).toBe(false)
  expect(await Bun.file(new URL('commands/auth.ts', cliRoot)).exists()).toBe(
    false,
  )
})

test('OAuth declarations expose bounded hosts through the public SDK', async () => {
  const [adapterContract, providerContract] = await Promise.all([
    Bun.file(new URL('adapter.ts', sdkRoot)).text(),
    Bun.file(new URL('provider.ts', sdkRoot)).text(),
  ])
  expect(providerContract).toContain('allowedHosts')
  expect(adapterContract).toContain('providerApiHosts')
  expect(providerContract).toContain('identity')
  expect(adapterContract).toContain('provider')

  const declaredHosts = new Set<string>()
  for (const extension of CTXINDEX_BUILTIN_EXTENSIONS) {
    for (const adapter of extension.adapters) {
      for (const host of adapter.providerApiHosts ?? []) declaredHosts.add(host)
      const provider = adapter.provider
      if (provider?.auth.kind !== 'oauth2') continue
      for (const host of provider.auth.allowedHosts) declaredHosts.add(host)
      for (const endpoint of [
        provider.auth.authorizationUrl,
        provider.auth.tokenUrl,
        provider.auth.identity.url,
      ])
        declaredHosts.add(new URL(endpoint).hostname)
    }
  }
  expect([...declaredHosts].sort()).toEqual([
    'accounts.google.com',
    'gmail.googleapis.com',
    'graph.microsoft.com',
    'login.microsoftonline.com',
    'oauth2.googleapis.com',
    'openidconnect.googleapis.com',
    'www.googleapis.com',
  ])
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
    'documentation.ts',
    'extension.ts',
    'index.ts',
    'oauth-app.ts',
    'operations.ts',
    'profile.ts',
    'provider.ts',
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
      new URL(
        '../../scripts/verify/repo-development-skill.test.ts',
        import.meta.url,
      ),
    ).exists(),
  ).toBe(true)
  expect(
    await Bun.file(
      new URL('meta/repo-development-skill.test.ts', coreSourceRoot),
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
