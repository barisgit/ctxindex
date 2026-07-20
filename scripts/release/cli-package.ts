import { Database } from 'bun:sqlite'
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '../..')
const cliRoot = join(repoRoot, 'apps/cli')
const stagingRoot = join(repoRoot, 'dist/npm/package')

export interface CliSourceManifest {
  readonly name: string
  readonly version: string
  readonly description: string
  readonly license: 'MIT'
  readonly type: 'module'
  readonly bin: { readonly ctxindex: string }
  readonly files: readonly string[]
  readonly engines: { readonly bun: string }
  readonly repository: {
    readonly type: 'git'
    readonly url: string
    readonly directory: string
  }
  readonly publishConfig: {
    readonly access: 'public'
    readonly registry: string
  }
  readonly devDependencies?: Readonly<Record<string, string>>
}

export interface CliPublishManifest {
  readonly name: 'ctxindex'
  readonly version: string
  readonly description: string
  readonly license: 'MIT'
  readonly type: 'module'
  readonly bin: { readonly ctxindex: 'dist/ctxindex.mjs' }
  readonly files: readonly ['dist/ctxindex.mjs', 'README.md', 'LICENSE']
  readonly engines: { readonly bun: '1.3.14' }
  readonly repository: {
    readonly type: 'git'
    readonly url: 'git+https://github.com/barisgit/ctxindex.git'
    readonly directory: 'apps/cli'
  }
  readonly publishConfig: {
    readonly access: 'public'
    readonly registry: 'https://registry.npmjs.org/'
  }
  readonly dependencies: { readonly keytar: '7.9.0' }
  readonly trustedDependencies: readonly ['keytar']
}

export interface PackageFile {
  readonly path: string
  readonly content: string | Uint8Array
}

export interface PackageContentEntry {
  readonly path: string
  readonly sha256: string
}

export interface CliPackageSmokeResult {
  readonly archive: string
  readonly packageName: 'ctxindex'
  readonly nativeKeytarLoaded: true
}

const allowedPackagePaths = [
  'package/LICENSE',
  'package/README.md',
  'package/dist/ctxindex.mjs',
  'package/package.json',
] as const

const sensitiveContentPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bnpm_[A-Za-z0-9]{36,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
  /\/\/registry\.npmjs\.org\/:_authToken\s*=/,
  /\bAKIA[0-9A-Z]{16}\b/,
] as const

function bytes(content: PackageFile['content']): Uint8Array {
  return typeof content === 'string'
    ? new TextEncoder().encode(content)
    : content
}

function text(content: PackageFile['content']): string {
  return typeof content === 'string'
    ? content
    : new TextDecoder('utf8', { fatal: true }).decode(content)
}

export function packageContentManifest(
  files: readonly PackageFile[],
): readonly PackageContentEntry[] {
  return [...files]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((file) => ({
      path: file.path,
      sha256: new Bun.CryptoHasher('sha256')
        .update(bytes(file.content))
        .digest('hex'),
    }))
}

export function assertSafePackageFiles(files: readonly PackageFile[]): void {
  const paths = files.map(({ path }) => path).sort()
  if (
    JSON.stringify(paths) !== JSON.stringify([...allowedPackagePaths].sort())
  ) {
    throw new TypeError(`Unexpected package files: ${paths.join(', ')}`)
  }
  for (const path of paths) {
    if (
      path.startsWith('/') ||
      path.includes('\\') ||
      path.split('/').includes('..')
    ) {
      throw new TypeError(`Unsafe package path: ${path}`)
    }
  }

  for (const file of files) {
    const content = text(file.content)
    if (sensitiveContentPatterns.some((pattern) => pattern.test(content))) {
      throw new TypeError(`Sensitive content in package file: ${file.path}`)
    }
  }

  const byPath = new Map(files.map((file) => [file.path, file]))
  const manifestText = text(byPath.get('package/package.json')?.content ?? '')
  if (manifestText.includes('workspace:')) {
    throw new TypeError(
      'Published package metadata contains workspace protocol',
    )
  }
  const manifest = JSON.parse(manifestText) as Partial<CliPublishManifest>
  if (
    manifest.name !== 'ctxindex' ||
    manifest.license !== 'MIT' ||
    manifest.bin?.ctxindex !== 'dist/ctxindex.mjs' ||
    manifest.engines?.bun !== '1.3.14' ||
    JSON.stringify(manifest.files) !==
      JSON.stringify(['dist/ctxindex.mjs', 'README.md', 'LICENSE']) ||
    JSON.stringify(manifest.dependencies) !==
      JSON.stringify({ keytar: '7.9.0' }) ||
    JSON.stringify(manifest.trustedDependencies) !== JSON.stringify(['keytar'])
  ) {
    throw new TypeError(
      'Published package metadata does not match runtime contract',
    )
  }

  const executable = text(
    byPath.get('package/dist/ctxindex.mjs')?.content ?? '',
  )
  if (!executable.startsWith('#!/usr/bin/env bun\n')) {
    throw new TypeError('Published executable is missing the Bun shebang')
  }
  if (
    /(?:from\s+|import\s+(?:[^'"]+\s+from\s+)?|import\s*\()\s*['"]@ctxindex\//.test(
      executable,
    )
  ) {
    throw new TypeError('Published executable contains a workspace import')
  }
  if (executable.includes('workspace:')) {
    throw new TypeError('Published executable contains workspace metadata')
  }
  if (executable.includes('devDependencies')) {
    throw new TypeError('Published executable contains a development manifest')
  }
  if (
    /["'`](?:\/(?:[^"'`/]+\/)*|[A-Za-z]:[\\/](?:[^"'`\\/]+[\\/])*)(?:node_modules|apps[\\/]cli|packages)(?:[\\/][^"'`]*)?["'`]/.test(
      executable,
    )
  ) {
    throw new TypeError(
      'Published executable contains an absolute source checkout path',
    )
  }
}

export function createPublishManifest(
  source: CliSourceManifest,
): CliPublishManifest {
  return {
    name: 'ctxindex',
    version: source.version,
    description: source.description,
    license: 'MIT',
    type: 'module',
    bin: { ctxindex: 'dist/ctxindex.mjs' },
    files: ['dist/ctxindex.mjs', 'README.md', 'LICENSE'],
    engines: { bun: '1.3.14' },
    repository: {
      type: 'git',
      url: 'git+https://github.com/barisgit/ctxindex.git',
      directory: 'apps/cli',
    },
    publishConfig: {
      access: 'public',
      registry: 'https://registry.npmjs.org/',
    },
    dependencies: { keytar: '7.9.0' },
    trustedDependencies: ['keytar'],
  }
}

async function run(
  command: readonly string[],
  options: {
    readonly cwd?: string
    readonly env?: Readonly<Record<string, string>>
  } = {},
): Promise<{ readonly stdout: string; readonly stderr: string }> {
  const child = Bun.spawn(command, {
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
  if (exitCode !== 0) {
    throw new Error(
      `${command.join(' ')} failed with exit ${exitCode}: ${stderr || stdout}`,
    )
  }
  return { stdout, stderr }
}

async function prepareCliPackage(): Promise<CliPublishManifest> {
  await run([process.execPath, 'run', 'build:package'], { cwd: cliRoot })
  const source = (await Bun.file(
    join(cliRoot, 'package.json'),
  ).json()) as CliSourceManifest
  const manifest = createPublishManifest(source)

  await rm(stagingRoot, { recursive: true, force: true })
  await mkdir(join(stagingRoot, 'dist'), { recursive: true, mode: 0o755 })
  await copyFile(
    join(cliRoot, 'dist/ctxindex.mjs'),
    join(stagingRoot, 'dist/ctxindex.mjs'),
  )
  await chmod(join(stagingRoot, 'dist/ctxindex.mjs'), 0o755)
  await copyFile(join(cliRoot, 'README.md'), join(stagingRoot, 'README.md'))
  await copyFile(join(repoRoot, 'LICENSE'), join(stagingRoot, 'LICENSE'))
  await writeFile(
    join(stagingRoot, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o644 },
  )
  return manifest
}

export async function packCliPackage(destination: string): Promise<string> {
  const manifest = await prepareCliPackage()
  const resolvedDestination = resolve(destination)
  const filename = `ctxindex-${manifest.version}.tgz`
  const archive = join(resolvedDestination, filename)
  await mkdir(resolvedDestination, { recursive: true, mode: 0o755 })
  await rm(archive, { force: true })
  await run(
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
  const child = Bun.spawn(['tar', '-xOzf', archive, member], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [exitCode, content, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0) {
    throw new Error(
      `Could not read ${member} from ${basename(archive)}: ${stderr}`,
    )
  }
  return new Uint8Array(content)
}

export async function readPackageFiles(
  archive: string,
): Promise<readonly PackageFile[]> {
  const { stdout } = await run(['tar', '-tzf', archive])
  const members = stdout
    .split('\n')
    .map((member) => member.trim())
    .filter(Boolean)
  return Promise.all(
    members.map(async (path) => ({
      path,
      content: await readArchiveMember(archive, path),
    })),
  )
}

function processEnvironment(
  overrides: Readonly<Record<string, string>>,
): Record<string, string> {
  const inheritedNames = [
    'HTTPS_PROXY',
    'HTTP_PROXY',
    'NO_PROXY',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
    'LANG',
    'LC_ALL',
    'TMPDIR',
  ] as const
  const inherited = Object.fromEntries(
    inheritedNames.flatMap((name) => {
      const value = process.env[name]
      return value === undefined ? [] : [[name, value]]
    }),
  )
  return { ...inherited, ...overrides }
}

export async function smokeCliPackage(
  archive: string,
  smokeRoot: string,
): Promise<CliPackageSmokeResult> {
  const resolvedArchive = resolve(archive)
  const files = await readPackageFiles(resolvedArchive)
  assertSafePackageFiles(files)

  const globalDirectory = join(smokeRoot, 'global')
  const binDirectory = join(smokeRoot, 'bin')
  const cacheDirectory = join(smokeRoot, 'cache')
  const outsideDirectory = join(smokeRoot, 'outside')
  const homeDirectory = join(smokeRoot, 'home')
  const configDirectory = join(smokeRoot, 'ctxindex-config')
  const dataDirectory = join(smokeRoot, 'ctxindex-data')
  const stateDirectory = join(smokeRoot, 'ctxindex-state')
  const ctxindexCacheDirectory = join(smokeRoot, 'ctxindex-cache')
  await Promise.all(
    [
      globalDirectory,
      binDirectory,
      cacheDirectory,
      outsideDirectory,
      homeDirectory,
    ].map((path) => mkdir(path, { recursive: true, mode: 0o700 })),
  )

  const env = processEnvironment({
    HOME: homeDirectory,
    PATH: `${binDirectory}:${process.env.PATH ?? '/usr/bin:/bin'}`,
    BUN_INSTALL_GLOBAL_DIR: globalDirectory,
    BUN_INSTALL_BIN: binDirectory,
    BUN_INSTALL_CACHE_DIR: cacheDirectory,
    CTXINDEX_CONFIG_HOME: configDirectory,
    CTXINDEX_DATA_HOME: dataDirectory,
    CTXINDEX_STATE_HOME: stateDirectory,
    CTXINDEX_CACHE_HOME: ctxindexCacheDirectory,
  })
  await run([process.execPath, 'add', '--global', resolvedArchive], {
    cwd: outsideDirectory,
    env,
  })

  const keytarEntry = join(globalDirectory, 'node_modules/keytar/lib/keytar.js')
  await run(
    [
      process.execPath,
      '-e',
      "const keytar = await import(process.env.KEYTAR_ENTRY); if (typeof keytar.getPassword !== 'function') throw new Error('keytar native API unavailable')",
    ],
    {
      cwd: outsideDirectory,
      env: { ...env, KEYTAR_ENTRY: keytarEntry },
    },
  )

  const executable = join(binDirectory, 'ctxindex')
  const cli = (args: readonly string[], overrides = {}) =>
    run([executable, ...args], {
      cwd: outsideDirectory,
      env: { ...env, ...overrides },
    })
  const help = await cli(['--help'])
  if (!help.stdout.includes('ctxindex')) {
    throw new Error('Installed CLI help did not identify ctxindex')
  }
  const skills = await cli(['skills', 'get', 'getting-started'])
  if (!skills.stdout.startsWith('# Getting started with ctxindex')) {
    throw new Error('Installed CLI could not read its bundled skill')
  }

  await cli(['init'], {
    CTXINDEX_KEYTAR_MOCK_FILE: join(smokeRoot, 'keytar.json'),
  })
  const database = new Database(join(dataDirectory, 'ctxindex.sqlite'), {
    readonly: true,
  })
  try {
    const migrationCount = database
      .query('SELECT COUNT(*) AS count FROM ctxindex_migrations_core')
      .get() as { readonly count: number }
    if (migrationCount.count === 0) {
      throw new Error('Installed CLI did not apply embedded SQL migrations')
    }
  } finally {
    database.close()
  }

  const extensionPath = join(smokeRoot, 'installed-extension.ts')
  await writeFile(
    extensionPath,
    "export default ({ defineExtension }) => defineExtension({ id: 'fixture.installed-package', version: 1, profiles: [], adapters: [] })\n",
  )
  await writeFile(
    join(configDirectory, 'config.toml'),
    `[extensions]\npaths = ${JSON.stringify([extensionPath])}\n\n[secrets]\nbackend = "file"\n\n[log]\nlevel = "info"\n\n[log.file]\nrotate = "daily"\nretain_days = 14\ncompress = true\n`,
  )
  const extensions = JSON.parse(
    (await cli(['extensions', 'list', '--json'])).stdout,
  ) as readonly { readonly id?: string }[]
  if (!extensions.some(({ id }) => id === 'fixture.installed-package')) {
    throw new Error('Installed CLI could not load a TypeScript Extension')
  }

  const installedManifest = JSON.parse(
    await readFile(
      join(globalDirectory, 'node_modules/ctxindex/package.json'),
      'utf8',
    ),
  ) as { readonly name?: string }
  if (installedManifest.name !== 'ctxindex') {
    throw new Error('Global installation did not contain ctxindex')
  }
  return {
    archive: resolvedArchive,
    packageName: 'ctxindex',
    nativeKeytarLoaded: true,
  }
}

async function main(args: readonly string[]): Promise<number> {
  const [command, argument] = args
  if (command === 'pack') {
    const archive = await packCliPackage(
      argument ?? join(repoRoot, 'dist/npm/artifacts'),
    )
    const files = await readPackageFiles(archive)
    assertSafePackageFiles(files)
    console.log(archive)
    return 0
  }
  if (command === 'verify' && argument !== undefined) {
    const files = await readPackageFiles(resolve(argument))
    assertSafePackageFiles(files)
    console.log(JSON.stringify(packageContentManifest(files), null, 2))
    return 0
  }
  if (command === 'smoke' && argument !== undefined) {
    const smokeRoot = await mkdtemp(join(tmpdir(), 'ctxindex-package-smoke-'))
    try {
      const result = await smokeCliPackage(resolve(argument), smokeRoot)
      console.log(JSON.stringify(result, null, 2))
    } finally {
      await rm(smokeRoot, { recursive: true, force: true })
    }
    return 0
  }
  console.error(
    'usage: cli-package.ts pack [destination] | verify <archive> | smoke <archive>',
  )
  return 2
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2))
