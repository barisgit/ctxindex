import { Database } from 'bun:sqlite'
import {
  chmod,
  copyFile,
  cp,
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
  readonly homepage: string
  readonly bugs: { readonly url: string }
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
  readonly homepage: 'https://ctxindex.com'
  readonly bugs: {
    readonly url: 'https://github.com/barisgit/ctxindex/issues'
  }
  readonly type: 'module'
  readonly bin: { readonly ctxindex: 'dist/ctxindex.mjs' }
  readonly files: readonly [
    'dist/ctxindex.mjs',
    'dist/ctxindex-daemon',
    'README.md',
    'LICENSE',
  ]
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
  readonly nativeKeytar: NativeKeytarProbeStatus
  readonly oauthAppHelpLoaded: true
  readonly preInitStatePreserved: true
  readonly packageExtensionLoaded: true
  readonly daemonLifecycleAvailable: true
}

export type NativeKeytarProbeStatus = 'loaded' | 'host-libsecret-unavailable'

type NativeKeytarProbeClassification = NativeKeytarProbeStatus | 'failed'

interface CommandResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

const allowedPackagePaths = [
  'package/LICENSE',
  'package/README.md',
  'package/dist/ctxindex-daemon',
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
    manifest.homepage !== 'https://ctxindex.com' ||
    manifest.bugs?.url !== 'https://github.com/barisgit/ctxindex/issues' ||
    manifest.bin?.ctxindex !== 'dist/ctxindex.mjs' ||
    manifest.engines?.bun !== '1.3.14' ||
    JSON.stringify(manifest.files) !==
      JSON.stringify([
        'dist/ctxindex.mjs',
        'dist/ctxindex-daemon',
        'README.md',
        'LICENSE',
      ]) ||
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
  const daemonExecutable = text(
    byPath.get('package/dist/ctxindex-daemon')?.content ?? '',
  )
  if (!executable.startsWith('#!/usr/bin/env bun\n')) {
    throw new TypeError('Published executable is missing the Bun shebang')
  }
  if (!daemonExecutable.startsWith('#!/usr/bin/env bun\n')) {
    throw new TypeError(
      'Published daemon executable is missing the Bun shebang',
    )
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
    homepage: 'https://ctxindex.com',
    bugs: { url: 'https://github.com/barisgit/ctxindex/issues' },
    type: 'module',
    bin: { ctxindex: 'dist/ctxindex.mjs' },
    files: [
      'dist/ctxindex.mjs',
      'dist/ctxindex-daemon',
      'README.md',
      'LICENSE',
    ],
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
  const result = await runWithExit(command, options)
  if (result.exitCode !== 0) {
    throw new Error(
      `${command.join(' ')} failed with exit ${result.exitCode}: ${result.stderr || result.stdout}`,
    )
  }
  return result
}

async function runWithExit(
  command: readonly string[],
  options: {
    readonly cwd?: string
    readonly env?: Readonly<Record<string, string>>
  } = {},
): Promise<CommandResult> {
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
  return { exitCode, stdout, stderr }
}

export function classifyNativeKeytarProbe(
  platform: NodeJS.Platform,
  result: CommandResult,
): NativeKeytarProbeClassification {
  if (result.exitCode === 0) return 'loaded'

  const diagnostic = `${result.stderr}\n${result.stdout}`
  if (
    platform === 'linux' &&
    diagnostic.includes('libsecret-1.so.0') &&
    (diagnostic.includes('cannot open shared object file') ||
      diagnostic.includes('No such file or directory'))
  ) {
    return 'host-libsecret-unavailable'
  }
  return 'failed'
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
  await copyFile(
    join(cliRoot, 'dist/ctxindex-daemon'),
    join(stagingRoot, 'dist/ctxindex-daemon'),
  )
  await chmod(join(stagingRoot, 'dist/ctxindex-daemon'), 0o755)
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
  const keytarProbe = await runWithExit(
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
  const nativeKeytar = classifyNativeKeytarProbe(process.platform, keytarProbe)
  if (nativeKeytar === 'failed') {
    throw new Error(
      `Installed native keytar probe failed with exit ${keytarProbe.exitCode}: ${keytarProbe.stderr || keytarProbe.stdout}`,
    )
  }

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
  const oauthAppHelp = await cli(['oauth-app', '--help'])
  if (!oauthAppHelp.stdout.includes('ctxindex oauth-app add|list|remove')) {
    throw new Error('Installed CLI help did not expose OAuth App commands')
  }
  const skills = await cli(['skills', 'get', 'getting-started'])
  if (!skills.stdout.startsWith('# Getting started with ctxindex')) {
    throw new Error('Installed CLI could not read its bundled skill')
  }

  const keytarMockFile = join(smokeRoot, 'keytar.json')
  const preInit = await runWithExit(
    [
      executable,
      'oauth-app',
      'add',
      'microsoft',
      'package-smoke',
      '--from-env',
    ],
    {
      cwd: outsideDirectory,
      env: {
        ...env,
        CTXINDEX_KEYTAR_MOCK_FILE: keytarMockFile,
        CTXINDEX_MICROSOFT_CLIENT_ID: 'package-smoke-client-id-canary',
      },
    },
  )
  if (
    preInit.exitCode !== 2 ||
    !preInit.stderr.includes(
      'ctxindex is not initialized; run ctxindex init',
    ) ||
    preInit.stderr.includes('run bun cli init')
  ) {
    throw new Error(
      `Installed CLI did not reject pre-init OAuth App add safely: ${preInit.stderr || preInit.stdout}`,
    )
  }
  if (`${preInit.stdout}${preInit.stderr}`.includes('client-id-canary')) {
    throw new Error('Installed CLI exposed pre-init OAuth App configuration')
  }
  for (const path of [
    join(configDirectory, 'config.toml'),
    join(dataDirectory, 'ctxindex.sqlite'),
    join(dataDirectory, 'secrets.box'),
    join(configDirectory, 'secret.key'),
    keytarMockFile,
  ]) {
    if (await Bun.file(path).exists()) {
      throw new Error(`Installed CLI created pre-init state: ${path}`)
    }
  }

  await cli(['init'], { CTXINDEX_KEYTAR_MOCK_FILE: keytarMockFile })
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

  if (process.platform === 'darwin') {
    let lifecycleFailure: unknown
    let startedInstanceId: string | undefined
    try {
      const started = await runWithExit(
        [executable, 'daemon', 'start', '--format', 'json'],
        { cwd: outsideDirectory, env },
      )
      if (started.exitCode !== 0) {
        throw new Error(
          `Installed CLI background daemon did not become ready: ${started.stderr || started.stdout}`,
        )
      }
      const startedOutput = JSON.parse(started.stdout)
      if (
        startedOutput.status !== 'running' ||
        typeof startedOutput.health?.instanceId !== 'string'
      ) {
        throw new Error(
          `Installed CLI background daemon did not become ready: ${started.stderr || started.stdout}`,
        )
      }
      startedInstanceId = startedOutput.health.instanceId
      const observed = await cli(['daemon', 'status', '--format', 'json'])
      const observedOutput = JSON.parse(observed.stdout)
      if (
        observedOutput.status !== 'running' ||
        observedOutput.health?.instanceId !== startedInstanceId
      ) {
        throw new Error(
          `Installed CLI background daemon did not survive detached startup: ${observed.stderr || observed.stdout}`,
        )
      }
    } catch (error) {
      lifecycleFailure = error
    } finally {
      const stopped = await runWithExit(
        [executable, 'daemon', 'stop', '--format', 'json'],
        { cwd: outsideDirectory, env },
      )
      let stopFailure: unknown
      if (stopped.exitCode !== 0) {
        stopFailure = new Error(
          `Installed CLI background daemon did not stop cleanly: ${stopped.stderr || stopped.stdout}`,
        )
      } else {
        try {
          const stoppedOutput = JSON.parse(stopped.stdout)
          if (
            stoppedOutput.status !== 'stopped' ||
            (startedInstanceId !== undefined &&
              (stoppedOutput.alreadyStopped !== false ||
                stoppedOutput.instanceId !== startedInstanceId))
          ) {
            stopFailure = new Error(
              `Installed CLI background daemon did not stop cleanly: ${stopped.stderr || stopped.stdout}`,
            )
          }
        } catch (error) {
          stopFailure = error
        }
      }
      lifecycleFailure ??= stopFailure
    }
    if (lifecycleFailure) throw lifecycleFailure
  } else {
    const unsupported = await runWithExit([executable, 'daemon', 'start'], {
      cwd: outsideDirectory,
      env,
    })
    if (
      unsupported.exitCode !== 50 ||
      unsupported.stderr.trim() !==
        'The local daemon is unsupported on this platform.'
    ) {
      throw new Error(
        `Installed CLI daemon did not fail closed on an unsupported host: ${unsupported.stderr || unsupported.stdout}`,
      )
    }
  }

  const extensionPath = join(smokeRoot, 'installed-extension')
  await mkdir(extensionPath, { recursive: true, mode: 0o700 })
  await mkdir(join(extensionPath, 'node_modules/@ctxindex'), {
    recursive: true,
    mode: 0o700,
  })
  await cp(
    join(repoRoot, 'packages/extension-sdk'),
    join(extensionPath, 'node_modules/@ctxindex/extension-sdk'),
    { recursive: true },
  )
  await cp(
    join(repoRoot, 'node_modules/zod'),
    join(extensionPath, 'node_modules/zod'),
    {
      recursive: true,
    },
  )
  await writeFile(
    join(extensionPath, 'package.json'),
    `${JSON.stringify(
      {
        name: '@ctxindex/package-smoke-extension',
        version: '1.0.0',
        private: true,
        type: 'module',
        ctxindex: { extensions: ['./extension.ts'] },
        dependencies: { '@ctxindex/extension-sdk': '0.0.0' },
      },
      null,
      2,
    )}\n`,
  )
  await writeFile(
    join(extensionPath, 'extension.ts'),
    "import { defineExtension } from '@ctxindex/extension-sdk'\nexport default defineExtension({ id: 'fixture.installed-package' })\n",
  )
  await writeFile(
    join(configDirectory, 'config.toml'),
    `[extensions]\npaths = ${JSON.stringify([extensionPath])}\n\n[secrets]\nbackend = "file"\n\n[log]\nlevel = "info"\n\n[log.file]\nrotate = "daily"\nretain_days = 14\ncompress = true\n`,
  )
  const extensions = JSON.parse(
    (await cli(['extension', 'list', '--format', 'json'])).stdout,
  ) as readonly { readonly id?: string }[]
  if (!extensions.some(({ id }) => id === 'fixture.installed-package')) {
    throw new Error(
      'Installed CLI could not load a package-root TypeScript Extension',
    )
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
    nativeKeytar,
    oauthAppHelpLoaded: true,
    preInitStatePreserved: true,
    packageExtensionLoaded: true,
    daemonLifecycleAvailable: true,
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
