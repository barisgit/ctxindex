import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, posix, resolve } from 'node:path'
import {
  assertSafeExtensionSdkPackageFiles,
  extensionSdkPackageArchiveName,
  readExtensionSdkPackageFiles,
} from './extension-sdk-package'

const repoRoot = resolve(import.meta.dir, '../..')
const profilesRoot = join(repoRoot, 'packages/profiles')
const stagingRoot = join(repoRoot, 'dist/npm/profiles-package')
const tsc = join(repoRoot, 'node_modules/.bin/tsc')
const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
const entryNames = [
  'index',
  'calendar-event',
  'chat-message',
  'mail-message',
  'file',
] as const

export interface ProfilesSourceManifest {
  readonly name: string
  readonly version: string
  readonly description: string
  readonly license: string
  readonly private: boolean
  readonly type: string
  readonly dependencies: Readonly<Record<string, string>>
}

type ProfilesExport = {
  readonly types: string
  readonly import: string
}

export interface ProfilesPublishManifest {
  readonly name: '@ctxindex/profiles'
  readonly version: string
  readonly description: string
  readonly license: 'MIT'
  readonly homepage: 'https://ctxindex.com'
  readonly bugs: { readonly url: 'https://github.com/barisgit/ctxindex/issues' }
  readonly type: 'module'
  readonly exports: Readonly<{
    '.': ProfilesExport
    './calendar-event': ProfilesExport
    './chat-message': ProfilesExport
    './mail-message': ProfilesExport
    './file': ProfilesExport
  }>
  readonly files: readonly ['dist', 'README.md', 'LICENSE']
  readonly engines: { readonly bun: '1.3.14' }
  readonly repository: {
    readonly type: 'git'
    readonly url: 'git+https://github.com/barisgit/ctxindex.git'
    readonly directory: 'packages/profiles'
  }
  readonly publishConfig: {
    readonly access: 'public'
    readonly registry: 'https://registry.npmjs.org/'
  }
  readonly dependencies: {
    readonly '@ctxindex/extension-sdk': string
    readonly zod: '^4.4.3'
  }
  readonly private?: never
}

export interface ProfilesPackageFile {
  readonly path: string
  readonly content: string | Uint8Array
}

interface CommandResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

const sensitiveContentPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bnpm_[A-Za-z0-9]{20,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\/\/registry\.npmjs\.org\/:_authToken\s*=/,
  /\bAKIA[0-9A-Z]{16}\b/,
] as const

function packageExport(name: (typeof entryNames)[number]): ProfilesExport {
  return {
    types: `./dist/${name}.d.ts`,
    import: `./dist/${name}.js`,
  }
}

export function createProfilesPublishManifest(
  source: ProfilesSourceManifest,
): ProfilesPublishManifest {
  if (!semverPattern.test(source.version)) {
    throw new TypeError(`${source.version} is not a valid semantic version`)
  }
  const sdkVersion = source.dependencies['@ctxindex/extension-sdk'] ?? ''
  if (!semverPattern.test(sdkVersion)) {
    throw new TypeError(`${sdkVersion} is not a valid semantic version`)
  }
  if (
    source.name !== '@ctxindex/profiles' ||
    source.license !== 'MIT' ||
    source.private !== true ||
    source.type !== 'module' ||
    source.dependencies.zod !== '^4.4.3'
  ) {
    throw new TypeError('Profiles source manifest is not publishable')
  }

  return {
    name: '@ctxindex/profiles',
    version: source.version,
    description: source.description,
    license: 'MIT',
    homepage: 'https://ctxindex.com',
    bugs: { url: 'https://github.com/barisgit/ctxindex/issues' },
    type: 'module',
    exports: {
      '.': packageExport('index'),
      './calendar-event': packageExport('calendar-event'),
      './chat-message': packageExport('chat-message'),
      './mail-message': packageExport('mail-message'),
      './file': packageExport('file'),
    },
    files: ['dist', 'README.md', 'LICENSE'],
    engines: { bun: '1.3.14' },
    repository: {
      type: 'git',
      url: 'git+https://github.com/barisgit/ctxindex.git',
      directory: 'packages/profiles',
    },
    publishConfig: {
      access: 'public',
      registry: 'https://registry.npmjs.org/',
    },
    dependencies: {
      '@ctxindex/extension-sdk': sdkVersion,
      zod: '^4.4.3',
    },
  }
}

export function profilesPackageArchiveName(version: string): string {
  if (!semverPattern.test(version)) {
    throw new TypeError(`${version} is not a valid semantic version`)
  }
  return `ctxindex-profiles-${version}.tgz`
}

function text(content: ProfilesPackageFile['content']): string {
  return typeof content === 'string'
    ? content
    : new TextDecoder('utf-8', { fatal: true }).decode(content)
}

function isAllowedPackagePath(path: string): boolean {
  return (
    path === 'package/LICENSE' ||
    path === 'package/README.md' ||
    path === 'package/package.json' ||
    /^package\/dist\/chunks\/[a-z0-9-]+\.js$/.test(path) ||
    entryNames.some(
      (name) =>
        path === `package/dist/${name}.js` ||
        path === `package/dist/${name}.d.ts`,
    )
  )
}

function importedSpecifiers(content: string): readonly string[] {
  return [
    ...content.matchAll(/(?:from\s+|import\s*(?:\(\s*)?)['"]([^'"]+)['"]/g),
  ].flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
}

export function assertSafeProfilesPackageFiles(
  files: readonly ProfilesPackageFile[],
): void {
  const paths = files.map(({ path }) => path).sort()
  for (const path of paths) {
    if (
      !isAllowedPackagePath(path) ||
      path.startsWith('/') ||
      path.includes('\\') ||
      path.split('/').includes('..')
    ) {
      throw new TypeError(`Unexpected Profiles package file: ${path}`)
    }
  }

  for (const required of [
    'package/LICENSE',
    'package/README.md',
    'package/package.json',
    ...entryNames.flatMap((name) => [
      `package/dist/${name}.d.ts`,
      `package/dist/${name}.js`,
    ]),
  ]) {
    if (!paths.includes(required)) {
      throw new TypeError(`Missing Profiles package file: ${required}`)
    }
  }

  for (const file of files) {
    const content = text(file.content)
    if (sensitiveContentPatterns.some((pattern) => pattern.test(content))) {
      throw new TypeError(`Sensitive content in package file: ${file.path}`)
    }
    if (content.includes('workspace:')) {
      throw new TypeError(`Workspace metadata in package file: ${file.path}`)
    }
    if (content.includes(repoRoot)) {
      throw new TypeError(`Checkout path in package file: ${file.path}`)
    }
    if (file.path.startsWith('package/dist/')) {
      for (const specifier of importedSpecifiers(content)) {
        if (
          specifier.startsWith('@ctxindex/') &&
          specifier !== '@ctxindex/extension-sdk'
        ) {
          throw new TypeError(
            `Private ctxindex import in package file: ${file.path}`,
          )
        }
      }
    }
  }

  const manifestFile = files.find(({ path }) => path === 'package/package.json')
  const manifest = JSON.parse(text(manifestFile?.content ?? '')) as Record<
    string,
    unknown
  >
  if ('scripts' in manifest || 'devDependencies' in manifest) {
    throw new TypeError('Profiles publish manifest contains tooling')
  }
  const expected = createProfilesPublishManifest({
    name: String(manifest.name ?? ''),
    version: String(manifest.version ?? ''),
    description: String(manifest.description ?? ''),
    license: String(manifest.license ?? ''),
    private: true,
    type: String(manifest.type ?? ''),
    dependencies:
      typeof manifest.dependencies === 'object' &&
      manifest.dependencies !== null
        ? (manifest.dependencies as Readonly<Record<string, string>>)
        : {},
  })
  if (JSON.stringify(manifest) !== JSON.stringify(expected)) {
    throw new TypeError('Profiles publish manifest does not match contract')
  }

  const allowedRuntimeImports = new Set(['@ctxindex/extension-sdk', 'zod'])
  const runtimePaths = new Set(paths.filter((path) => path.endsWith('.js')))
  for (const file of files.filter(({ path }) => path.endsWith('.js'))) {
    const unexpected = importedSpecifiers(text(file.content)).filter(
      (specifier) => {
        if (allowedRuntimeImports.has(specifier)) return false
        if (!specifier.startsWith('.')) return true
        const target = posix.normalize(
          posix.join(posix.dirname(file.path), specifier),
        )
        return !runtimePaths.has(target)
      },
    )
    if (unexpected.length > 0) {
      throw new TypeError(
        `Profiles runtime has undeclared imports: ${unexpected.join(', ')}`,
      )
    }
  }

  const declarationPaths = new Set(
    paths.filter((path) => path.endsWith('.d.ts')),
  )
  for (const file of files.filter(({ path }) => path.endsWith('.d.ts'))) {
    for (const specifier of importedSpecifiers(text(file.content))) {
      if (!specifier.startsWith('.')) continue
      if (!specifier.endsWith('.js')) {
        throw new TypeError(
          `Profiles declaration has a non-ESM relative import: ${file.path} -> ${specifier}`,
        )
      }
      const target = posix.normalize(
        posix.join(posix.dirname(file.path), `${specifier.slice(0, -3)}.d.ts`),
      )
      if (!declarationPaths.has(target)) {
        throw new TypeError(
          `Profiles declaration import is missing: ${file.path} -> ${specifier}`,
        )
      }
    }
  }
}

async function run(
  command: readonly string[],
  options: {
    readonly cwd?: string
    readonly env?: Readonly<Record<string, string | undefined>>
  } = {},
): Promise<CommandResult> {
  const child = Bun.spawn([...command], {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    ...(options.env === undefined ? {} : { env: options.env }),
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  return { exitCode, stdout, stderr }
}

async function runRequired(
  command: readonly string[],
  options: Parameters<typeof run>[1] = {},
): Promise<CommandResult> {
  const result = await run(command, options)
  if (result.exitCode !== 0) {
    throw new Error(
      `${command.join(' ')} failed with exit ${result.exitCode}: ${result.stderr || result.stdout}`,
    )
  }
  return result
}

async function rewriteDeclarationSpecifiers(outputRoot: string): Promise<void> {
  for (const entry of await readdir(outputRoot)) {
    if (!entry.endsWith('.d.ts')) continue
    const path = join(outputRoot, entry)
    const declaration = await readFile(path, 'utf8')
    const addJavaScriptExtension = (
      match: string,
      prefix: string,
      open: string,
      specifier: string,
      close: string,
    ): string =>
      specifier.endsWith('.js')
        ? match
        : `${prefix}${open}${specifier}.js${close}`
    await writeFile(
      path,
      declaration
        .replace(/(\bfrom\s+)(['"])(\.\/[^'"]+)(['"])/g, addJavaScriptExtension)
        .replace(
          /(\bimport\s*\(\s*)(['"])(\.\/[^'"]+)(['"])/g,
          addJavaScriptExtension,
        ),
      { mode: 0o644 },
    )
  }
}

export async function buildProfilesPackage(): Promise<void> {
  const outputRoot = join(profilesRoot, 'dist')
  await rm(outputRoot, { recursive: true, force: true })
  await mkdir(outputRoot, { recursive: true, mode: 0o755 })

  const result = await Bun.build({
    entrypoints: entryNames.map((name) => join(profilesRoot, `src/${name}.ts`)),
    outdir: outputRoot,
    target: 'bun',
    format: 'esm',
    external: ['@ctxindex/extension-sdk', 'zod'],
    splitting: true,
    naming: {
      entry: '[name].js',
      chunk: 'chunks/[name]-[hash].js',
    },
  })
  if (!result.success) {
    throw new Error(result.logs.map((log) => log.message).join('\n'))
  }
  await runRequired(
    [tsc, '--project', join(profilesRoot, 'tsconfig.build.json')],
    {
      cwd: profilesRoot,
    },
  )
  await rewriteDeclarationSpecifiers(outputRoot)
}

async function prepareProfilesPackage(): Promise<ProfilesPublishManifest> {
  await buildProfilesPackage()
  const source = JSON.parse(
    await readFile(join(profilesRoot, 'package.json'), 'utf8'),
  ) as ProfilesSourceManifest
  const manifest = createProfilesPublishManifest(source)

  await rm(stagingRoot, { recursive: true, force: true })
  await mkdir(stagingRoot, { recursive: true, mode: 0o755 })
  await cp(join(profilesRoot, 'dist'), join(stagingRoot, 'dist'), {
    recursive: true,
  })
  await copyFile(
    join(profilesRoot, 'README.md'),
    join(stagingRoot, 'README.md'),
  )
  await copyFile(join(repoRoot, 'LICENSE'), join(stagingRoot, 'LICENSE'))
  await writeFile(
    join(stagingRoot, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o644 },
  )
  return manifest
}

export async function packProfilesPackage(
  destination = join(repoRoot, 'dist/npm/artifacts'),
): Promise<string> {
  const manifest = await prepareProfilesPackage()
  const resolvedDestination = resolve(destination)
  const archive = join(
    resolvedDestination,
    profilesPackageArchiveName(manifest.version),
  )
  await mkdir(resolvedDestination, { recursive: true, mode: 0o755 })
  await rm(archive, { force: true })
  await runRequired(
    [
      process.execPath,
      'pm',
      'pack',
      '--ignore-scripts',
      '--quiet',
      '--destination',
      resolvedDestination,
    ],
    { cwd: stagingRoot },
  )
  return archive
}

async function readArchiveMember(
  archive: string,
  member: string,
): Promise<Uint8Array> {
  const result = Bun.spawn(['tar', '-xOzf', archive, member], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [exitCode, content, stderr] = await Promise.all([
    result.exited,
    new Response(result.stdout).arrayBuffer(),
    new Response(result.stderr).text(),
  ])
  if (exitCode !== 0) throw new Error(`Could not read ${member}: ${stderr}`)
  return new Uint8Array(content)
}

export async function readProfilesPackageFiles(
  archive: string,
): Promise<readonly ProfilesPackageFile[]> {
  const listed = await runRequired(['tar', '-tzf', resolve(archive)])
  const members = listed.stdout
    .split('\n')
    .map((member) => member.trim())
    .filter(Boolean)
  return Promise.all(
    members.map(async (path) => ({
      path,
      content: await readArchiveMember(resolve(archive), path),
    })),
  )
}

export async function checksumProfilesPackage(
  archive: string,
): Promise<string> {
  const resolvedArchive = resolve(archive)
  const digest = new Bun.CryptoHasher('sha256')
    .update(await Bun.file(resolvedArchive).arrayBuffer())
    .digest('hex')
  const checksum = `${digest}  ${basename(resolvedArchive)}\n`
  await writeFile(`${resolvedArchive}.sha256`, checksum, { mode: 0o644 })
  return checksum
}

export async function smokeProfilesPackage(archive: string): Promise<void> {
  const resolvedArchive = resolve(archive)
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-profiles-smoke-'))
  try {
    const files = await readProfilesPackageFiles(resolvedArchive)
    const packageManifest = JSON.parse(
      text(
        files.find(({ path }) => path === 'package/package.json')?.content ??
          '',
      ),
    ) as ProfilesPublishManifest
    const sdkVersion = packageManifest.dependencies['@ctxindex/extension-sdk']
    const sdkArchive = join(
      dirname(resolvedArchive),
      extensionSdkPackageArchiveName(sdkVersion),
    )
    const localSdkArchive = (await Bun.file(sdkArchive).exists())
      ? sdkArchive
      : undefined
    if (localSdkArchive !== undefined) {
      const sdkFiles = await readExtensionSdkPackageFiles(localSdkArchive)
      assertSafeExtensionSdkPackageFiles(sdkFiles)
      const sdkManifest = JSON.parse(
        text(
          sdkFiles.find(({ path }) => path === 'package/package.json')
            ?.content ?? '',
        ),
      ) as { readonly name?: unknown; readonly version?: unknown }
      if (
        sdkManifest.name !== '@ctxindex/extension-sdk' ||
        sdkManifest.version !== sdkVersion
      ) {
        throw new TypeError(
          'Local Extension SDK artifact does not match Profiles dependency',
        )
      }
    }
    await cp(join(import.meta.dir, 'fixtures/profiles-consumer'), root, {
      recursive: true,
    })
    const manifest = JSON.parse(
      await readFile(join(root, 'package.json'), 'utf8'),
    ) as {
      dependencies: Record<string, string>
      overrides?: Record<string, string>
    }
    manifest.dependencies['@ctxindex/extension-sdk'] =
      localSdkArchive === undefined ? sdkVersion : `file:${localSdkArchive}`
    if (localSdkArchive !== undefined) {
      manifest.overrides = {
        ...manifest.overrides,
        '@ctxindex/extension-sdk': `file:${localSdkArchive}`,
      }
    }
    manifest.dependencies['@ctxindex/profiles'] = `file:${resolvedArchive}`
    await writeFile(
      join(root, 'package.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    )
    const installTemp = join(root, 'tmp')
    await mkdir(installTemp, { recursive: true, mode: 0o700 })
    await runRequired(
      [process.execPath, 'install', '--ignore-scripts', '--backend=copyfile'],
      { cwd: root, env: { ...process.env, TMPDIR: installTemp } },
    )
    await runRequired([tsc, '--project', join(root, 'tsconfig.json')], {
      cwd: root,
    })
    const runtime = await runRequired([process.execPath, 'run', 'index.ts'], {
      cwd: root,
    })
    const result = JSON.parse(runtime.stdout) as {
      readonly root?: readonly string[]
      readonly subpaths?: readonly string[]
      readonly identical?: Readonly<Record<string, boolean>>
    }
    const expected = ['calendar.event', 'chat.message', 'mail.message', 'file']
    if (
      JSON.stringify(result.root) !== JSON.stringify(expected) ||
      JSON.stringify(result.subpaths) !== JSON.stringify(expected) ||
      JSON.stringify(result.identical) !==
        JSON.stringify({
          calendarEvent: true,
          chatMessage: true,
          mailMessage: true,
          file: true,
        })
    ) {
      throw new Error(`Unexpected Profiles smoke output: ${runtime.stdout}`)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

export async function verifyProfilesPackage(
  archive: string,
  smoke = false,
): Promise<string> {
  const files = await readProfilesPackageFiles(archive)
  assertSafeProfilesPackageFiles(files)
  if (smoke) await smokeProfilesPackage(archive)
  return checksumProfilesPackage(archive)
}

async function main(args: readonly string[]): Promise<number> {
  const [command, argument] = args
  if (command === 'build') {
    await buildProfilesPackage()
    return 0
  }
  if (command === 'pack') {
    console.log(
      await packProfilesPackage(
        argument ?? join(repoRoot, 'dist/npm/artifacts'),
      ),
    )
    return 0
  }
  if (command === 'verify' && argument !== undefined) {
    console.log((await verifyProfilesPackage(argument)).trimEnd())
    return 0
  }
  if (command === 'smoke' && argument !== undefined) {
    await smokeProfilesPackage(argument)
    return 0
  }
  if (command === 'prepare') {
    const archive = await packProfilesPackage(
      argument ?? join(repoRoot, 'dist/npm/artifacts'),
    )
    console.log((await verifyProfilesPackage(archive, true)).trimEnd())
    console.log(archive)
    return 0
  }
  console.error(
    'usage: profiles-package.ts build | pack [destination] | verify <archive> | smoke <archive> | prepare [destination]',
  )
  return 2
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2))
