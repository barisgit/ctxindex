import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { join, relative } from 'node:path'
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
  cleanup(): Promise<void>
}

export interface PackageMaterializer {
  materialize(
    target: DirectExtensionTarget,
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

export const runPackageProcess: PackageProcessRunner = async (input) => {
  const temporaryDirectory = join(input.cwd, '.ctxindex-package-tmp')
  await mkdir(temporaryDirectory, { recursive: true, mode: 0o700 })
  let child: ReturnType<typeof Bun.spawn>
  try {
    child = Bun.spawn([input.executable, ...input.args], {
      cwd: input.cwd,
      env: {
        ...process.env,
        TMPDIR: temporaryDirectory,
        BUN_INSTALL_CACHE_DIR: join(input.cwd, '.ctxindex-bun-cache'),
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
      return first !== '.git' && first !== 'node_modules'
    },
  })
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
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<MaterializedDirectExtension> {
    await mkdir(this.stagingParent, { recursive: true, mode: 0o700 })
    const stagingRoot = await mkdtemp(join(this.stagingParent, '.acquire-'))
    try {
      let packageRoot: string
      let source: DirectExtensionInstallationRecord['source']
      if (target.kind === 'local') {
        packageRoot = 'package'
        const destination = join(stagingRoot, packageRoot)
        await copyPackageSnapshot(target.originPath, destination)
        const contentDigest = await hashDirectory(destination)
        await this.run({
          executable: this.bunExecutable,
          args: ['install', '--production', '--ignore-scripts'],
          cwd: destination,
          timeoutMs: this.timeoutMs,
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        })
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
      } else {
        await writeFile(
          join(stagingRoot, 'package.json'),
          `${JSON.stringify({ name: 'ctxindex-direct-staging', private: true })}\n`,
          { mode: 0o600 },
        )
        await this.run({
          executable: this.bunExecutable,
          args: ['add', '--ignore-scripts', '--exact', target.requestedTarget],
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
        packageRoot = join('node_modules', ...key.split('/'))
        const resolvedManifest = JSON.parse(
          await readFile(
            join(stagingRoot, packageRoot, 'package.json'),
            'utf8',
          ),
        )
        const lockText = await readFile(
          join(stagingRoot, 'bun.lock'),
          'utf8',
        ).catch(() => '')
        if (target.kind === 'npm') {
          const integrity = packageIntegrity(lockText, key)
          source = {
            kind: 'npm',
            requested_target: target.requestedTarget,
            exact_version: packageVersion(resolvedManifest),
            ...(integrity === undefined ? {} : { integrity }),
          }
        } else {
          const commit = packageGitCommit(lockText, key)
          if (commit === undefined) {
            throw acquisitionFailure(
              'Package manager did not report an exact Git commit',
            )
          }
          source = {
            kind: 'git',
            requested_target: target.requestedTarget,
            commit,
          }
        }
      }
      await normalizeMaterialization(stagingRoot)
      const materializationDigest = await hashDirectory(stagingRoot)
      return {
        stagingRoot,
        packageRoot: packageRoot.split('\\').join('/'),
        source,
        materializationDigest,
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
}
