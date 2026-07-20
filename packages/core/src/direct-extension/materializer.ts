import { createHash } from 'node:crypto'
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { join, relative } from 'node:path'
import { compareUnicodeCodePoints } from '../internal/code-point-order'
import type { DirectExtensionInstallationRecord } from './schema'
import { hashDirectory } from './store'
import type { DirectExtensionTarget } from './target'

export interface PackageProcessInput {
  readonly executable: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly timeoutMs: number
  readonly signal?: AbortSignal
}

export type PackageProcessRunner = (input: PackageProcessInput) => Promise<void>

export interface MaterializedDirectExtension {
  readonly stagingRoot: string
  readonly packageRoot: string
  readonly source: DirectExtensionInstallationRecord['source']
  readonly materializationDigest: string
  readonly dependencyResolutionArtifact: ExactDependencyResolutionArtifact
  cleanup(): Promise<void>
}

export interface ExactDependencyResolutionArtifact {
  readonly format: 'bun.lock@1.3.14'
  readonly digest: string
  readonly bytes: Uint8Array
}

export interface ExactDirectExtensionMaterialization {
  readonly source: DirectExtensionInstallationRecord['source']
  readonly packageRoot: string
  readonly materializationDigest: string
  readonly dependencyResolutionArtifact: ExactDependencyResolutionArtifact
  readonly localPackageRoot?: string
  readonly excludeCatalogSnapshotMetadata?: boolean
}

export interface PackageMaterializer {
  materialize(
    target: DirectExtensionTarget,
    options?: {
      readonly signal?: AbortSignal
      readonly excludeCatalogSnapshotMetadata?: boolean
    },
  ): Promise<MaterializedDirectExtension>
  materializeExact(
    input: ExactDirectExtensionMaterialization,
    options?: { readonly signal?: AbortSignal },
  ): Promise<MaterializedDirectExtension>
}

function acquisitionFailure(message: string, cause?: unknown): Error {
  return Object.assign(
    new Error(message, cause === undefined ? undefined : { cause }),
    { code: 'extension_acquisition_failed', exitCode: 30 },
  )
}

async function drainBounded(
  stream: ReadableStream<Uint8Array> | number | null | undefined,
  limit = 64 * 1024,
): Promise<void> {
  if (stream === null || stream === undefined || typeof stream === 'number')
    return
  const reader = stream.getReader()
  let read = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) return
      read += chunk.value.byteLength
      if (read > limit)
        throw acquisitionFailure(
          'Package manager output exceeded the safe limit',
        )
    }
  } finally {
    reader.releaseLock()
  }
}

function credentialFreeRegistryEnvironment(): Readonly<Record<string, string>> {
  const registry = process.env.BUN_CONFIG_REGISTRY
  if (registry === undefined) return {}
  try {
    const parsed = new URL(registry)
    if (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.username.length === 0 &&
      parsed.password.length === 0 &&
      parsed.search.length === 0 &&
      parsed.hash.length === 0
    ) {
      return { BUN_CONFIG_REGISTRY: registry }
    }
  } catch {
    // Ignore invalid or credential-bearing ambient registry configuration.
  }
  return {}
}

export const runPackageProcess: PackageProcessRunner = async (input) => {
  const temporaryDirectory = join(input.cwd, '.ctxindex-package-tmp')
  await mkdir(temporaryDirectory, { recursive: true, mode: 0o700 })
  let child: ReturnType<typeof Bun.spawn>
  try {
    child = Bun.spawn([input.executable, ...input.args], {
      cwd: input.cwd,
      env: {
        PATH: process.env.PATH ?? '/usr/bin:/bin:/usr/sbin:/sbin',
        HOME: temporaryDirectory,
        TMPDIR: temporaryDirectory,
        LANG: 'C.UTF-8',
        LC_ALL: 'C.UTF-8',
        BUN_INSTALL_CACHE_DIR: join(input.cwd, '.ctxindex-bun-cache'),
        ...credentialFreeRegistryEnvironment(),
        GIT_TERMINAL_PROMPT: '0',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_ASKPASS: '/usr/bin/false',
        SSH_ASKPASS: '/usr/bin/false',
        GCM_INTERACTIVE: 'Never',
        npm_config_userconfig: '/dev/null',
      },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    })
  } catch (cause) {
    throw acquisitionFailure('Package manager could not start', cause)
  }
  const timeout = setTimeout(() => child.kill('SIGTERM'), input.timeoutMs)
  const cancel = () => child.kill('SIGTERM')
  input.signal?.addEventListener('abort', cancel, { once: true })
  try {
    const [, , exitCode] = await Promise.all([
      drainBounded(child.stdout),
      drainBounded(child.stderr),
      child.exited,
    ])
    if (input.signal?.aborted) {
      throw Object.assign(new Error('Package acquisition cancelled'), {
        code: 'cancelled',
        exitCode: 130,
      })
    }
    if (exitCode !== 0) {
      throw acquisitionFailure(`Package manager exited with status ${exitCode}`)
    }
  } catch (cause) {
    child.kill('SIGTERM')
    throw cause
  } finally {
    clearTimeout(timeout)
    input.signal?.removeEventListener('abort', cancel)
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

async function copyPackageSnapshot(
  source: string,
  destination: string,
  options: { readonly excludeCatalogSnapshotMetadata?: boolean } = {},
): Promise<void> {
  const info = await stat(source)
  if (!info.isDirectory())
    throw acquisitionFailure(
      'Local Extension target is not a package directory',
    )
  await cp(source, destination, {
    recursive: true,
    dereference: true,
    force: false,
    filter: (path) => {
      const rel = relative(source, path)
      const first = rel.split(/[\\/]/)[0]
      return (
        first !== '.git' &&
        first !== 'node_modules' &&
        (!options.excludeCatalogSnapshotMetadata ||
          (rel !== 'ctxindex-catalog.json' && first !== 'ctxindex-resolutions'))
      )
    },
  })
  await normalizeTreePermissions(destination)
}

async function normalizeTreePermissions(path: string): Promise<void> {
  const info = await stat(path)
  if (info.isDirectory()) {
    await chmod(path, 0o755)
    for (const entry of await readdir(path)) {
      await normalizeTreePermissions(join(path, entry))
    }
    return
  }
  if (info.isFile()) {
    await chmod(path, (info.mode & 0o111) === 0 ? 0o644 : 0o755)
    return
  }
  throw acquisitionFailure('Local Extension package contains a special file')
}

async function normalizeMaterialization(root: string): Promise<void> {
  const normalized = `${root}-normalized-${crypto.randomUUID()}`
  try {
    await cp(root, normalized, {
      recursive: true,
      dereference: true,
      force: false,
    })
    await rm(root, { recursive: true, force: true })
    await rename(normalized, root)
  } finally {
    await rm(normalized, { recursive: true, force: true })
  }
}

function packageKey(manifest: unknown): string {
  if (manifest === null || typeof manifest !== 'object') {
    throw acquisitionFailure(
      'Package manager produced an invalid staging manifest',
    )
  }
  const dependencies = (manifest as { dependencies?: unknown }).dependencies
  if (
    dependencies === null ||
    typeof dependencies !== 'object' ||
    Array.isArray(dependencies)
  ) {
    throw acquisitionFailure('Package manager did not resolve one package')
  }
  const keys = Object.keys(dependencies)
  if (keys.length !== 1 || keys[0] === undefined) {
    throw acquisitionFailure(
      'Package manager did not resolve exactly one package',
    )
  }
  return keys[0]
}

function packageVersion(manifest: unknown): string {
  const version =
    manifest !== null && typeof manifest === 'object'
      ? (manifest as { version?: unknown }).version
      : undefined
  if (typeof version !== 'string' || version.length === 0) {
    throw acquisitionFailure('Resolved package has no exact version')
  }
  return version
}

function packageIdentity(manifest: unknown): string {
  const name =
    manifest !== null && typeof manifest === 'object'
      ? (manifest as { name?: unknown }).name
      : undefined
  if (
    typeof name !== 'string' ||
    !/^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/i.test(
      name,
    )
  ) {
    throw acquisitionFailure('Resolved package has no valid package identity')
  }
  return name
}

function packageLockEntry(
  lockText: string,
  packageName: string,
): readonly unknown[] | undefined {
  let lock: unknown
  try {
    lock = Bun.JSONC.parse(lockText)
  } catch {
    return undefined
  }
  if (lock === null || typeof lock !== 'object') return undefined
  const packages = (lock as { packages?: unknown }).packages
  if (packages === null || typeof packages !== 'object') return undefined
  const entry = (packages as Record<string, unknown>)[packageName]
  return Array.isArray(entry) ? entry : undefined
}

function resolvedPackageName(lockText: string, dependencyKey: string): string {
  const resolution = packageLockEntry(lockText, dependencyKey)?.[0]
  if (typeof resolution !== 'string') return dependencyKey
  const separator = resolution.startsWith('@')
    ? resolution.indexOf('@', resolution.indexOf('/') + 1)
    : resolution.indexOf('@')
  if (separator <= 0) return dependencyKey
  const candidate = resolution.slice(0, separator)
  return /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/i.test(
    candidate,
  )
    ? candidate
    : dependencyKey
}

function pinGitWorkspaceDependency(
  lockText: string,
  dependencyKey: string,
  exactTarget: string,
): string {
  const lock = Bun.JSONC.parse(lockText) as {
    workspaces?: Record<
      string,
      { dependencies?: Record<string, unknown> } | undefined
    >
  }
  const dependencies = lock.workspaces?.['']?.dependencies
  if (
    dependencies !== undefined &&
    typeof dependencies[dependencyKey] === 'string'
  ) {
    dependencies[dependencyKey] = exactTarget
  }
  return JSON.stringify(lock)
}

function packageIntegrity(
  lockText: string,
  packageName: string,
): string | undefined {
  const entry = packageLockEntry(lockText, packageName)
  const integrity = entry?.[3]
  return typeof integrity === 'string' && integrity.startsWith('sha')
    ? integrity
    : undefined
}

function packageGitCommit(
  lockText: string,
  packageName: string,
): string | undefined {
  const entry = packageLockEntry(lockText, packageName)
  if (entry?.length !== 3) return undefined
  const resolution = entry[0]
  const revision = entry[2]
  return typeof resolution === 'string' &&
    /@(?:git\+|github:)/i.test(resolution) &&
    typeof revision === 'string' &&
    /^[0-9a-f]{40,64}$/.test(revision)
    ? revision
    : undefined
}

function packageGitRepository(
  lockText: string,
  packageName: string,
): string | undefined {
  const resolution = packageLockEntry(lockText, packageName)?.[0]
  if (typeof resolution !== 'string') return undefined
  const resolvedName = resolvedPackageName(lockText, packageName)
  const prefix = `${resolvedName}@`
  if (!resolution.startsWith(prefix)) return undefined
  const repository = resolution.slice(prefix.length).replace(/#.*$/, '')
  return repository.length === 0 ? undefined : repository
}

interface BunResolutionEnvelope {
  readonly schemaVersion: 1
  readonly bunVersion: '1.3.14'
  readonly manifest?: unknown
  readonly lockfile: unknown
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareUnicodeCodePoints(left, right))
      .map(([key, child]) => [key, canonicalValue(child)]),
  )
}

function containsCredentials(value: string): boolean {
  const scpUser =
    /^([^/@\s]+)@(?:localhost|[a-z0-9.-]+\.[a-z]{2,}):[^\s]+$/i.exec(value)?.[1]
  if (scpUser !== undefined) return scpUser !== 'git'
  const parsed = resolutionUrl(value)
  return (
    parsed !== undefined &&
    (parsed.username.length > 0 || parsed.password.length > 0)
  )
}

function resolutionUrl(value: string): URL | undefined {
  const raw = /(?:^|@)((?:git\+)?(?:git|https?|ssh):\/\/[^\s]+)/i.exec(
    value,
  )?.[1]
  if (raw === undefined) return undefined
  try {
    return new URL(raw.replace(/^git\+/, ''))
  } catch {
    return undefined
  }
}

const allowedResolutionProtocols = new Set([
  'file:',
  'bitbucket:',
  'git:',
  'git+http:',
  'git+https:',
  'git+ssh:',
  'github:',
  'gitlab:',
  'http:',
  'https:',
  'npm:',
  'ssh:',
])

function assertSanitizedResolutionString(value: string): void {
  if (containsCredentials(value))
    throw acquisitionFailure('Dependency resolution contains credentials')
  if (/^(?:\/|file:\/\/\/)/.test(value))
    throw acquisitionFailure(
      'Dependency resolution contains an absolute local path',
    )
  const protocol = /^([a-z][a-z0-9+.-]*:)/i.exec(value)?.[1]?.toLowerCase()
  if (protocol !== undefined && !allowedResolutionProtocols.has(protocol)) {
    throw acquisitionFailure(
      'Dependency resolution contains an unsupported protocol',
    )
  }
  const remote = resolutionUrl(value)
  if (
    remote !== undefined &&
    (remote.search.length > 0 ||
      (remote.hash.length > 0 &&
        (!isGitResolution(value) || !/^#[0-9a-f]{40,64}$/.test(remote.hash))))
  ) {
    throw acquisitionFailure(
      'Dependency resolution contains remote query or mutable fragment data',
    )
  }
  const pathValue = value.startsWith('file:') ? value.slice(5) : value
  if (
    pathValue.startsWith('/') ||
    pathValue.startsWith('~') ||
    pathValue.includes('\\') ||
    pathValue.split('/').some((part) => part === '..')
  ) {
    throw acquisitionFailure(
      'Dependency resolution contains a traversing local path',
    )
  }
  if (isGitResolution(value)) {
    const fragment = /#([^#]+)$/.exec(value)?.[1]
    if (fragment !== undefined && !/^[0-9a-f]{40,64}$/.test(fragment)) {
      throw acquisitionFailure(
        'Dependency resolution contains a mutable Git reference',
      )
    }
  }
}

function isGitResolution(value: string): boolean {
  return /(?:^|@)(?:bitbucket:|git(?:\+[^:]+)?:|github:|gitlab:|ssh:)|\.git(?:#|$)/i.test(
    value,
  )
}

function assertSanitizedArtifactValue(value: unknown): void {
  if (typeof value === 'string') {
    assertSanitizedResolutionString(value)
    return
  }
  if (Array.isArray(value)) {
    const resolution = value[0]
    if (
      typeof resolution === 'string' &&
      isGitResolution(resolution) &&
      (typeof value[2] !== 'string' || !/^[0-9a-f]{40,64}$/.test(value[2]))
    ) {
      throw acquisitionFailure(
        'Dependency resolution contains a mutable Git reference',
      )
    }
    for (const child of value) assertSanitizedArtifactValue(child)
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (
        /^(?:auth|authorization|headers?|password|proxy-authorization|scripts|token)$/i.test(
          key,
        )
      ) {
        throw acquisitionFailure(
          'Dependency resolution contains credentials or executable scripts',
        )
      }
      assertSanitizedArtifactValue(child)
    }
  }
}

function assertSupportedLockfile(lockfile: unknown): void {
  if (
    lockfile === null ||
    typeof lockfile !== 'object' ||
    (lockfile as { lockfileVersion?: unknown }).lockfileVersion !== 1 ||
    (lockfile as { packages?: unknown }).packages === null ||
    typeof (lockfile as { packages?: unknown }).packages !== 'object'
  ) {
    throw acquisitionFailure(
      'Dependency resolution uses an unsupported lock format',
    )
  }
}

function lockfileHasNoPackages(lockfile: unknown): boolean {
  const packages = (lockfile as { packages?: Record<string, unknown> }).packages
  return packages !== undefined && Object.keys(packages).length === 0
}

function artifactDigest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function createResolutionArtifact(input: {
  readonly manifest?: unknown
  readonly lockText: string
}): { artifact: ExactDependencyResolutionArtifact; canonicalLock: string } {
  let lockfile: unknown
  try {
    lockfile = Bun.JSONC.parse(input.lockText)
  } catch (cause) {
    throw acquisitionFailure(
      'Package manager did not produce a valid exact dependency resolution',
      cause,
    )
  }
  assertSupportedLockfile(lockfile)
  const envelope: BunResolutionEnvelope = {
    schemaVersion: 1,
    bunVersion: '1.3.14',
    ...(input.manifest === undefined ? {} : { manifest: input.manifest }),
    lockfile,
  }
  assertSanitizedArtifactValue(envelope)
  const bytes = new TextEncoder().encode(
    `${JSON.stringify(canonicalValue(envelope))}\n`,
  )
  return {
    artifact: {
      format: 'bun.lock@1.3.14',
      digest: artifactDigest(bytes),
      bytes,
    },
    canonicalLock: `${JSON.stringify(canonicalValue(lockfile), null, 2)}\n`,
  }
}

function readResolutionArtifact(
  artifact: ExactDependencyResolutionArtifact,
): BunResolutionEnvelope {
  if (
    artifact.format !== 'bun.lock@1.3.14' ||
    artifactDigest(artifact.bytes) !== artifact.digest
  ) {
    throw acquisitionFailure(
      'Dependency resolution artifact integrity mismatch',
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(artifact.bytes),
    )
  } catch (cause) {
    throw acquisitionFailure('Dependency resolution artifact is invalid', cause)
  }
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    (parsed as { schemaVersion?: unknown }).schemaVersion !== 1 ||
    (parsed as { bunVersion?: unknown }).bunVersion !== '1.3.14' ||
    !('lockfile' in parsed)
  ) {
    throw acquisitionFailure('Dependency resolution artifact is invalid')
  }
  assertSupportedLockfile((parsed as { lockfile: unknown }).lockfile)
  assertSanitizedArtifactValue(parsed)
  return parsed as unknown as BunResolutionEnvelope
}

async function assertExactReplayedSource(input: {
  readonly stagingRoot: string
  readonly packageRoot: string
  readonly source: Exclude<
    DirectExtensionInstallationRecord['source'],
    { readonly kind: 'local' }
  >
  readonly envelope: BunResolutionEnvelope
}): Promise<void> {
  if (input.envelope.manifest === undefined) {
    throw acquisitionFailure(
      'Dependency resolution artifact has no package manifest',
    )
  }
  const packageName = packageKey(input.envelope.manifest)
  const lockText = JSON.stringify(input.envelope.lockfile)
  const installedPackageName = resolvedPackageName(lockText, packageName)
  const expectedPackageRoot = join(
    'node_modules',
    ...installedPackageName.split('/'),
  )
    .split('\\')
    .join('/')
  if (input.packageRoot !== expectedPackageRoot) {
    throw acquisitionFailure('Exact replay package root mismatch')
  }
  const resolvedManifest = JSON.parse(
    await readFile(
      join(input.stagingRoot, input.packageRoot, 'package.json'),
      'utf8',
    ),
  )
  if (input.source.kind === 'npm') {
    if (
      input.source.integrity === undefined ||
      packageIdentity(resolvedManifest) !== input.source.package ||
      packageVersion(resolvedManifest) !== input.source.exact_version ||
      packageIntegrity(lockText, packageName) !== input.source.integrity
    ) {
      throw acquisitionFailure(
        'Exact npm version or integrity does not match frozen replay',
      )
    }
    return
  }
  if (
    packageGitRepository(lockText, packageName) !== input.source.repository ||
    packageGitCommit(lockText, packageName) !== input.source.commit
  ) {
    throw acquisitionFailure(
      'Exact Git repository or commit does not match frozen replay',
    )
  }
}

export interface BunPackageMaterializerOptions {
  readonly stagingParent: string
  readonly bunExecutable?: string
  readonly timeoutMs?: number
  readonly run?: PackageProcessRunner
}

export class BunPackageMaterializer implements PackageMaterializer {
  readonly stagingParent: string
  readonly bunExecutable: string
  readonly timeoutMs: number
  readonly run: PackageProcessRunner

  constructor(options: BunPackageMaterializerOptions) {
    this.stagingParent = options.stagingParent
    this.bunExecutable = options.bunExecutable ?? 'bun'
    this.timeoutMs = options.timeoutMs ?? 120_000
    this.run = options.run ?? runPackageProcess
  }

  async materialize(
    target: DirectExtensionTarget,
    options: {
      readonly signal?: AbortSignal
      readonly excludeCatalogSnapshotMetadata?: boolean
    } = {},
  ): Promise<MaterializedDirectExtension> {
    await mkdir(this.stagingParent, { recursive: true, mode: 0o700 })
    const stagingRoot = await mkdtemp(join(this.stagingParent, '.acquire-'))
    try {
      let packageRoot: string
      let source: DirectExtensionInstallationRecord['source']
      let resolutionManifest: unknown
      if (target.kind === 'local') {
        packageRoot = 'package'
        const destination = join(stagingRoot, packageRoot)
        await copyPackageSnapshot(target.originPath, destination, options)
        const contentDigest = await hashDirectory(destination)
        await this.run({
          executable: this.bunExecutable,
          args: [
            'install',
            '--save-text-lockfile',
            '--lockfile-only',
            '--ignore-scripts',
          ],
          cwd: destination,
          timeoutMs: this.timeoutMs,
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        })
        const localLockPath = join(destination, 'bun.lock')
        const lockWasOmitted = !(await Bun.file(localLockPath).exists())
        if (lockWasOmitted) {
          await writeFile(
            localLockPath,
            `${JSON.stringify({ lockfileVersion: 1, packages: {} })}\n`,
            { mode: 0o600 },
          )
        }
        if (!lockWasOmitted) {
          await this.run({
            executable: this.bunExecutable,
            args: [
              'install',
              '--frozen-lockfile',
              '--production',
              '--ignore-scripts',
            ],
            cwd: destination,
            timeoutMs: this.timeoutMs,
            ...(options.signal === undefined ? {} : { signal: options.signal }),
          })
        }
        await rm(join(destination, '.ctxindex-bun-cache'), {
          recursive: true,
          force: true,
        })
        source = {
          kind: 'local',
          requested_target: target.requestedTarget,
          origin_path: target.originPath,
          content_digest: contentDigest,
        }
        resolutionManifest = undefined
      } else {
        await writeFile(
          join(stagingRoot, 'package.json'),
          `${JSON.stringify({ name: 'ctxindex-direct-staging', private: true })}\n`,
          { mode: 0o600 },
        )
        await this.run({
          executable: this.bunExecutable,
          args: [
            'add',
            '--save-text-lockfile',
            '--ignore-scripts',
            '--exact',
            target.requestedTarget,
          ],
          cwd: stagingRoot,
          timeoutMs: this.timeoutMs,
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        })
        await rm(join(stagingRoot, '.ctxindex-bun-cache'), {
          recursive: true,
          force: true,
        })
        const stagingManifest = JSON.parse(
          await readFile(join(stagingRoot, 'package.json'), 'utf8'),
        )
        const key = packageKey(stagingManifest)
        resolutionManifest = stagingManifest
        let lockText = await readFile(
          join(stagingRoot, 'bun.lock'),
          'utf8',
        ).catch(() => '')
        const installedPackageName = resolvedPackageName(lockText, key)
        packageRoot = join('node_modules', ...installedPackageName.split('/'))
        const resolvedManifest = JSON.parse(
          await readFile(
            join(stagingRoot, packageRoot, 'package.json'),
            'utf8',
          ),
        )
        if (target.kind === 'npm') {
          const integrity = packageIntegrity(lockText, key)
          source = {
            kind: 'npm',
            requested_target: target.requestedTarget,
            package: packageIdentity(resolvedManifest),
            exact_version: packageVersion(resolvedManifest),
            ...(integrity === undefined ? {} : { integrity }),
          }
        } else {
          const commit = packageGitCommit(lockText, key)
          const repository = packageGitRepository(lockText, key)
          if (commit === undefined || repository === undefined) {
            throw acquisitionFailure(
              'Package manager did not report an exact Git repository and commit',
            )
          }
          source = {
            kind: 'git',
            requested_target: target.requestedTarget,
            repository,
            commit,
          }
          ;(
            resolutionManifest as {
              dependencies: Record<string, string>
            }
          ).dependencies[key] =
            `${target.requestedTarget.replace(/#.*$/, '')}#${commit}`
          lockText = pinGitWorkspaceDependency(
            lockText,
            key,
            (
              resolutionManifest as {
                dependencies: Record<string, string>
              }
            ).dependencies[key] as string,
          )
          await writeFile(join(stagingRoot, 'bun.lock'), lockText, {
            mode: 0o600,
          })
        }
      }
      const lockPath = join(
        stagingRoot,
        target.kind === 'local' ? packageRoot : '',
        'bun.lock',
      )
      const resolution = createResolutionArtifact({
        ...(resolutionManifest === undefined
          ? {}
          : { manifest: resolutionManifest }),
        lockText: await readFile(lockPath, 'utf8'),
      })
      if (resolutionManifest !== undefined) {
        await writeFile(
          join(stagingRoot, 'package.json'),
          `${JSON.stringify(canonicalValue(resolutionManifest), null, 2)}\n`,
          { mode: 0o600 },
        )
      }
      await writeFile(lockPath, resolution.canonicalLock, { mode: 0o600 })
      await normalizeTreePermissions(stagingRoot)
      await chmod(lockPath, 0o600)
      await normalizeMaterialization(stagingRoot)
      const materializationDigest = await hashDirectory(stagingRoot)
      return {
        stagingRoot,
        packageRoot: packageRoot.split('\\').join('/'),
        source,
        materializationDigest,
        dependencyResolutionArtifact: resolution.artifact,
        cleanup: () => rm(stagingRoot, { recursive: true, force: true }),
      }
    } catch (cause) {
      await rm(stagingRoot, { recursive: true, force: true })
      if (
        cause !== null &&
        typeof cause === 'object' &&
        'code' in cause &&
        cause.code !== undefined
      ) {
        throw cause
      }
      throw acquisitionFailure('Extension package acquisition failed', cause)
    }
  }

  async materializeExact(
    input: ExactDirectExtensionMaterialization,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<MaterializedDirectExtension> {
    const envelope = readResolutionArtifact(input.dependencyResolutionArtifact)
    await mkdir(this.stagingParent, { recursive: true, mode: 0o700 })
    const stagingRoot = await mkdtemp(join(this.stagingParent, '.replay-'))
    try {
      const packageRoot = input.packageRoot
      const installRoot =
        input.source.kind === 'local'
          ? join(stagingRoot, packageRoot)
          : stagingRoot
      if (input.source.kind === 'local') {
        const localPackageRoot =
          input.localPackageRoot ?? input.source.origin_path
        if (localPackageRoot === undefined)
          throw acquisitionFailure(
            'Exact local replay requires an immutable package root',
          )
        await copyPackageSnapshot(localPackageRoot, installRoot, {
          excludeCatalogSnapshotMetadata:
            input.excludeCatalogSnapshotMetadata === true,
        })
        if (
          (await hashDirectory(installRoot)) !== input.source.content_digest
        ) {
          throw acquisitionFailure('Local package content digest mismatch')
        }
      } else {
        if (envelope.manifest === undefined)
          throw acquisitionFailure(
            'Dependency resolution artifact has no package manifest',
          )
        await writeFile(
          join(stagingRoot, 'package.json'),
          `${JSON.stringify(canonicalValue(envelope.manifest), null, 2)}\n`,
          { mode: 0o600 },
        )
      }
      await writeFile(
        join(installRoot, 'bun.lock'),
        `${JSON.stringify(canonicalValue(envelope.lockfile), null, 2)}\n`,
        { mode: 0o600 },
      )
      if (
        input.source.kind !== 'local' ||
        !lockfileHasNoPackages(envelope.lockfile)
      ) {
        await this.run({
          executable: this.bunExecutable,
          args: [
            'install',
            '--save-text-lockfile',
            '--frozen-lockfile',
            '--production',
            '--ignore-scripts',
          ],
          cwd: installRoot,
          timeoutMs: this.timeoutMs,
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        })
      }
      if (input.source.kind !== 'local') {
        await assertExactReplayedSource({
          stagingRoot,
          packageRoot,
          source: input.source,
          envelope,
        })
      }
      await rm(join(installRoot, '.ctxindex-bun-cache'), {
        recursive: true,
        force: true,
      })
      await normalizeTreePermissions(stagingRoot)
      await chmod(join(installRoot, 'bun.lock'), 0o600)
      await normalizeMaterialization(stagingRoot)
      const materializationDigest = await hashDirectory(stagingRoot)
      if (materializationDigest !== input.materializationDigest)
        throw acquisitionFailure('Exact materialization digest mismatch')
      return {
        stagingRoot,
        packageRoot,
        source: input.source,
        materializationDigest,
        dependencyResolutionArtifact: input.dependencyResolutionArtifact,
        cleanup: () => rm(stagingRoot, { recursive: true, force: true }),
      }
    } catch (cause) {
      await rm(stagingRoot, { recursive: true, force: true })
      if (
        cause !== null &&
        typeof cause === 'object' &&
        'code' in cause &&
        cause.code !== undefined
      ) {
        throw cause
      }
      throw acquisitionFailure('Exact Extension package replay failed', cause)
    }
  }
}
