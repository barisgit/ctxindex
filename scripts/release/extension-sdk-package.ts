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
import { basename, join, posix, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '../..')
const sdkRoot = join(repoRoot, 'packages/extension-sdk')
const stagingRoot = join(repoRoot, 'dist/npm/extension-sdk-package')
const tsc = join(repoRoot, 'node_modules/.bin/tsc')
const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

export interface ExtensionSdkSourceManifest {
  readonly name: string
  readonly version: string
  readonly description: string
  readonly license: string
  readonly private: boolean
  readonly type: string
  readonly dependencies: Readonly<Record<string, string>>
}

export interface ExtensionSdkPublishManifest {
  readonly name: '@ctxindex/extension-sdk'
  readonly version: string
  readonly description: string
  readonly license: 'MIT'
  readonly homepage: 'https://ctxindex.com'
  readonly bugs: {
    readonly url: 'https://github.com/barisgit/ctxindex/issues'
  }
  readonly type: 'module'
  readonly exports: {
    readonly '.': {
      readonly types: './dist/index.d.ts'
      readonly import: './dist/index.js'
    }
  }
  readonly files: readonly ['dist', 'README.md', 'LICENSE']
  readonly engines: { readonly bun: '1.3.14' }
  readonly repository: {
    readonly type: 'git'
    readonly url: 'git+https://github.com/barisgit/ctxindex.git'
    readonly directory: 'packages/extension-sdk'
  }
  readonly publishConfig: {
    readonly access: 'public'
    readonly registry: 'https://registry.npmjs.org/'
  }
  readonly dependencies: { readonly zod: '^4.4.3' }
}

export interface ExtensionSdkPackageFile {
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

function text(content: ExtensionSdkPackageFile['content']): string {
  return typeof content === 'string'
    ? content
    : new TextDecoder('utf-8', { fatal: true }).decode(content)
}

function isAllowedPackagePath(path: string): boolean {
  return (
    path === 'package/LICENSE' ||
    path === 'package/README.md' ||
    path === 'package/package.json' ||
    path === 'package/dist/index.js' ||
    /^package\/dist\/[a-z][a-z-]*\.d\.ts$/.test(path)
  )
}

export function createExtensionSdkPublishManifest(
  source: ExtensionSdkSourceManifest,
): ExtensionSdkPublishManifest {
  if (!semverPattern.test(source.version)) {
    throw new TypeError(`${source.version} is not a valid semantic version`)
  }
  if (
    source.name !== '@ctxindex/extension-sdk' ||
    source.license !== 'MIT' ||
    source.private !== true ||
    source.type !== 'module' ||
    source.dependencies.zod !== '^4.4.3'
  ) {
    throw new TypeError('Extension SDK source manifest is not publishable')
  }
  return {
    name: '@ctxindex/extension-sdk',
    version: source.version,
    description: source.description,
    license: 'MIT',
    homepage: 'https://ctxindex.com',
    bugs: { url: 'https://github.com/barisgit/ctxindex/issues' },
    type: 'module',
    exports: {
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
      },
    },
    files: ['dist', 'README.md', 'LICENSE'],
    engines: { bun: '1.3.14' },
    repository: {
      type: 'git',
      url: 'git+https://github.com/barisgit/ctxindex.git',
      directory: 'packages/extension-sdk',
    },
    publishConfig: {
      access: 'public',
      registry: 'https://registry.npmjs.org/',
    },
    dependencies: { zod: '^4.4.3' },
  }
}

export function extensionSdkPackageArchiveName(version: string): string {
  if (!semverPattern.test(version)) {
    throw new TypeError(`${version} is not a valid semantic version`)
  }
  return `ctxindex-extension-sdk-${version}.tgz`
}

export function assertSafeExtensionSdkPackageFiles(
  files: readonly ExtensionSdkPackageFile[],
): void {
  const paths = files.map(({ path }) => path).sort()
  for (const path of paths) {
    if (
      !isAllowedPackagePath(path) ||
      path.startsWith('/') ||
      path.includes('\\') ||
      path.split('/').includes('..')
    ) {
      throw new TypeError(`Unexpected Extension SDK package file: ${path}`)
    }
  }
  for (const required of [
    'package/LICENSE',
    'package/README.md',
    'package/package.json',
    'package/dist/index.d.ts',
    'package/dist/index.js',
  ]) {
    if (!paths.includes(required)) {
      throw new TypeError(`Missing Extension SDK package file: ${required}`)
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
    if (
      file.path.startsWith('package/dist/') &&
      (/from\s+['"]@ctxindex\//.test(content) ||
        /import\s*(?:\(\s*)?['"]@ctxindex\//.test(content))
    ) {
      throw new TypeError(
        `Private ctxindex import in package file: ${file.path}`,
      )
    }
  }

  const manifestFile = files.find(({ path }) => path === 'package/package.json')
  const manifest = JSON.parse(text(manifestFile?.content ?? '')) as Record<
    string,
    unknown
  >
  if ('scripts' in manifest || 'devDependencies' in manifest) {
    throw new TypeError('Extension SDK publish manifest contains tooling')
  }
  const expected = createExtensionSdkPublishManifest({
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
    throw new TypeError(
      'Extension SDK publish manifest does not match contract',
    )
  }

  const runtime = text(
    files.find(({ path }) => path === 'package/dist/index.js')?.content ?? '',
  )
  const runtimeImports = [
    ...runtime.matchAll(/(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g),
  ].map((match) => match[1])
  if (runtimeImports.some((specifier) => specifier !== 'zod')) {
    throw new TypeError(
      `Extension SDK runtime has undeclared imports: ${runtimeImports.join(', ')}`,
    )
  }

  const declarationPaths = new Set(
    files.map(({ path }) => path).filter((path) => path.endsWith('.d.ts')),
  )
  for (const file of files.filter(({ path }) => path.endsWith('.d.ts'))) {
    const imports = [
      ...text(file.content).matchAll(
        /(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g,
      ),
    ].flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
    for (const specifier of imports) {
      if (!specifier.startsWith('.')) continue
      if (!specifier.endsWith('.js')) {
        throw new TypeError(
          `Extension SDK declaration has a non-ESM relative import: ${file.path} -> ${specifier}`,
        )
      }
      const target = posix.normalize(
        posix.join(posix.dirname(file.path), `${specifier.slice(0, -3)}.d.ts`),
      )
      if (!declarationPaths.has(target)) {
        throw new TypeError(
          `Extension SDK declaration import is missing: ${file.path} -> ${specifier}`,
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

export async function buildExtensionSdkPackage(): Promise<void> {
  const outputRoot = join(sdkRoot, 'dist')
  await rm(outputRoot, { recursive: true, force: true })
  await mkdir(outputRoot, { recursive: true, mode: 0o755 })

  const result = await Bun.build({
    entrypoints: [join(sdkRoot, 'src/index.ts')],
    outdir: outputRoot,
    target: 'bun',
    format: 'esm',
    external: ['zod'],
    naming: 'index.js',
  })
  if (!result.success) {
    throw new Error(result.logs.map((log) => log.message).join('\n'))
  }
  await runRequired([tsc, '--project', join(sdkRoot, 'tsconfig.build.json')], {
    cwd: sdkRoot,
  })
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

async function prepareExtensionSdkPackage(): Promise<ExtensionSdkPublishManifest> {
  await buildExtensionSdkPackage()
  const source = JSON.parse(
    await readFile(join(sdkRoot, 'package.json'), 'utf8'),
  ) as ExtensionSdkSourceManifest
  const manifest = createExtensionSdkPublishManifest(source)

  await rm(stagingRoot, { recursive: true, force: true })
  await mkdir(stagingRoot, { recursive: true, mode: 0o755 })
  await cp(join(sdkRoot, 'dist'), join(stagingRoot, 'dist'), {
    recursive: true,
  })
  await copyFile(join(sdkRoot, 'README.md'), join(stagingRoot, 'README.md'))
  await copyFile(join(repoRoot, 'LICENSE'), join(stagingRoot, 'LICENSE'))
  await writeFile(
    join(stagingRoot, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o644 },
  )
  return manifest
}

export async function packExtensionSdkPackage(
  destination = join(repoRoot, 'dist/npm/artifacts'),
): Promise<string> {
  const manifest = await prepareExtensionSdkPackage()
  const resolvedDestination = resolve(destination)
  const archive = join(
    resolvedDestination,
    extensionSdkPackageArchiveName(manifest.version),
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
  if (exitCode !== 0) {
    throw new Error(`Could not read ${member}: ${stderr}`)
  }
  return new Uint8Array(content)
}

export async function readExtensionSdkPackageFiles(
  archive: string,
): Promise<readonly ExtensionSdkPackageFile[]> {
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

export async function checksumExtensionSdkPackage(
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

export async function smokeExtensionSdkPackage(archive: string): Promise<void> {
  const resolvedArchive = resolve(archive)
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-extension-sdk-smoke-'))
  try {
    await cp(join(import.meta.dir, 'fixtures/extension-sdk-consumer'), root, {
      recursive: true,
    })
    const manifest = JSON.parse(
      await readFile(join(root, 'package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> }
    manifest.dependencies['@ctxindex/extension-sdk'] = `file:${resolvedArchive}`
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
      readonly extension?: string
      readonly catalog?: string
      readonly zod?: boolean
      readonly runtimeExports?: readonly string[]
    }
    if (
      result.extension !== 'fixture.consumer' ||
      result.catalog !== 'fixture.catalog' ||
      result.zod !== true ||
      JSON.stringify(result.runtimeExports) !==
        JSON.stringify([
          'auth',
          'defineAdapter',
          'defineCatalog',
          'defineExtension',
          'defineOAuthApp',
          'defineProfile',
          'defineProvider',
          'docs',
          'isSyncError',
          'packageExtension',
          'syncError',
          'z',
        ])
    ) {
      throw new Error(`Unexpected SDK smoke output: ${runtime.stdout}`)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

export async function verifyExtensionSdkPackage(
  archive: string,
  smoke = false,
): Promise<string> {
  const files = await readExtensionSdkPackageFiles(archive)
  assertSafeExtensionSdkPackageFiles(files)
  if (smoke) await smokeExtensionSdkPackage(archive)
  return checksumExtensionSdkPackage(archive)
}

async function main(args: readonly string[]): Promise<number> {
  const [command, argument] = args
  if (command === 'build') {
    await buildExtensionSdkPackage()
    return 0
  }
  if (command === 'pack') {
    console.log(
      await packExtensionSdkPackage(
        argument ?? join(repoRoot, 'dist/npm/artifacts'),
      ),
    )
    return 0
  }
  if (command === 'verify' && argument !== undefined) {
    console.log((await verifyExtensionSdkPackage(argument)).trimEnd())
    return 0
  }
  if (command === 'smoke' && argument !== undefined) {
    await smokeExtensionSdkPackage(argument)
    return 0
  }
  if (command === 'prepare') {
    const archive = await packExtensionSdkPackage(
      argument ?? join(repoRoot, 'dist/npm/artifacts'),
    )
    console.log((await verifyExtensionSdkPackage(archive, true)).trimEnd())
    console.log(archive)
    return 0
  }
  console.error(
    'usage: extension-sdk-package.ts build | pack [destination] | verify <archive> | smoke <archive> | prepare [destination]',
  )
  return 2
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2))
