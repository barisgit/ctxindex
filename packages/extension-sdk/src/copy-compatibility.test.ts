import { expect, test } from 'bun:test'
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

test('definitions compose across two physical SDK and Zod copies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-sdk-copies-'))

  try {
    const productionFiles = (await readdir(import.meta.dir)).filter(
      (file) => file.endsWith('.ts') && !file.endsWith('.test.ts'),
    )
    const zodRoot = dirname(
      fileURLToPath(import.meta.resolve('zod/package.json')),
    )

    for (const copyName of ['copy-a', 'copy-b']) {
      const copyRoot = join(root, copyName)
      const sdkSource = join(
        copyRoot,
        'node_modules',
        '@ctxindex',
        'extension-sdk',
        'src',
      )
      await mkdir(sdkSource, { recursive: true })
      await Promise.all(
        productionFiles.map((file) =>
          cp(join(import.meta.dir, file), join(sdkSource, file)),
        ),
      )
      await cp(zodRoot, join(copyRoot, 'node_modules', 'zod'), {
        recursive: true,
        dereference: true,
      })
    }

    const sdkAPath = join(
      root,
      'copy-a/node_modules/@ctxindex/extension-sdk/src/index.ts',
    )
    const sdkBPath = join(
      root,
      'copy-b/node_modules/@ctxindex/extension-sdk/src/index.ts',
    )
    const sdkA = (await import(
      pathToFileURL(sdkAPath).href
    )) as typeof import('./index')
    const sdkB = (await import(
      pathToFileURL(sdkBPath).href
    )) as typeof import('./index')

    const provider = sdkA.defineProvider({
      id: 'copy.oauth',
      auth: sdkA.auth.oauth2({
        authorizationUrl: 'https://auth.example.test/authorize',
        tokenUrl: 'https://auth.example.test/token',
        identity: {
          url: 'https://api.example.test/userinfo',
          subjectPath: ['sub'],
          labelPaths: [['email']],
          identities: [{ kind: 'email', path: ['email'] }],
        },
        pkce: { method: 'S256', required: true },
        registration: {
          type: 'public',
          configSchema: sdkA.z.object({ clientId: sdkA.z.string() }),
          environment: { clientId: 'CTXINDEX_COPY_CLIENT_ID' },
        },
        baseScopes: ['openid'],
        allowedHosts: ['api.example.test', 'auth.example.test'],
      }),
    })
    const profile = sdkA.defineProfile({
      id: 'copy.note',
      version: 1,
      schema: sdkA.z.object({ title: sdkA.z.string() }),
      search: { title: (payload) => payload.title },
    })
    const adapter = sdkB.defineAdapter({
      id: 'copy.adapter',
      configSchema: sdkB.z.object({}),
      provider,
      access: { scopes: ['notes.read'] },
      profiles: [profile],
      routing: 'indexed',
      capabilities: [],
      operations: {},
      actions: {},
    })
    const extension = sdkB.defineExtension({
      id: 'copy.extension',
      providers: [provider],
      profiles: [profile],
      adapters: [adapter],
    })
    const catalog = sdkB.defineCatalog({
      id: 'copy.catalog',
      label: 'Copy Catalog',
      extensions: [
        extension,
        sdkA.packageExtension(
          { kind: 'npm', target: '@copy/package@^1' },
          'copy.package',
        ),
      ],
    })

    expect(sdkA.z).not.toBe(sdkB.z)
    expect(sdkA.z.ZodObject).not.toBe(sdkB.z.ZodObject)
    expect(extension.providers[0]).toBe(provider)
    expect(extension.profiles[0]).toBe(profile)
    expect(catalog.extensions[0]).toBe(extension)

    const compileFixture = join(root, 'compile-fixture.ts')
    await writeFile(
      compileFixture,
      `import * as sdkA from './copy-a/node_modules/@ctxindex/extension-sdk/src/index.ts'
import * as sdkB from './copy-b/node_modules/@ctxindex/extension-sdk/src/index.ts'

const provider = sdkA.defineProvider({ id: 'copy.local', auth: sdkA.auth.none() })
const profile = sdkA.defineProfile({
  id: 'copy.note',
  version: 1,
  schema: sdkA.z.object({ title: sdkA.z.string() }),
  search: { title: (payload) => payload.title },
})
const adapter: sdkB.AnyAdapterDefinition = sdkB.defineAdapter({
  id: 'copy.adapter',
  configSchema: sdkB.z.object({}),
  provider,
  profiles: [profile],
  routing: 'indexed',
  capabilities: [],
  operations: {},
  actions: {},
})
sdkB.defineExtension({
  id: 'copy.extension',
  providers: [provider],
  profiles: [profile],
  adapters: [adapter],
})
const extension = sdkA.defineExtension({ id: 'copy.extension' })
const catalog: sdkB.AnyCatalogDefinition = sdkB.defineCatalog({
  id: 'copy.catalog',
  label: 'Copy Catalog',
  extensions: [
    extension,
    sdkA.packageExtension(
      { kind: 'local', target: './fixture' },
      'copy.local',
    ),
  ],
})
void catalog
`,
    )
    const tsgo = join(import.meta.dir, '../../../node_modules/.bin/tsgo')
    const compiled = Bun.spawnSync([
      tsgo,
      '--noEmit',
      '--ignoreConfig',
      '--strict',
      '--skipLibCheck',
      '--module',
      'Preserve',
      '--moduleResolution',
      'bundler',
      '--target',
      'ESNext',
      '--allowImportingTsExtensions',
      compileFixture,
    ])

    expect({
      exitCode: compiled.exitCode,
      stdout: compiled.stdout.toString(),
      stderr: compiled.stderr.toString(),
    }).toEqual({ exitCode: 0, stdout: '', stderr: '' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 15_000)
