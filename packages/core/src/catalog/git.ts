import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { catalogSnapshotPath, validateCatalogSnapshot } from './paths'
import { validateCatalogRef, validateCatalogRepository } from './repository'
import type { CatalogManifest } from './schema'
import { validateCatalogName } from './schema'

const gitConfig = [
  '--no-pager',
  '-c',
  'credential.helper=',
  '-c',
  'core.hooksPath=/dev/null',
  '-c',
  'protocol.allow=never',
  '-c',
  'protocol.file.allow=always',
  '-c',
  'protocol.https.allow=always',
  '-c',
  'filter.lfs.required=false',
  '-c',
  'filter.lfs.smudge=',
  '-c',
  'filter.lfs.process=',
] as const

function gitEnvironment(): Record<string, string> {
  const env: Record<string, string> = {
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'never',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_ASKPASS: '/usr/bin/false',
    GIT_LFS_SKIP_SMUDGE: '1',
  }
  if (process.env.PATH !== undefined) env.PATH = process.env.PATH
  if (process.env.TMPDIR !== undefined) env.TMPDIR = process.env.TMPDIR
  return env
}

async function run(
  executable: string,
  args: readonly string[],
  options: { readonly cwd?: string } = {},
): Promise<string> {
  const child = (() => {
    try {
      return Bun.spawn([executable, ...args], {
        ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
        env: gitEnvironment(),
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
      })
    } catch (cause) {
      throw Object.assign(
        new Error(`Catalog acquisition failed: ${executable} could not start`, {
          cause,
        }),
        { code: 'network' },
      )
    }
  })()
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0) {
    const message = stderr.trim() || `${executable} exited ${exitCode}`
    throw Object.assign(new Error(`Catalog acquisition failed: ${message}`), {
      code: 'network',
    })
  }
  return stdout.trim()
}

async function git(args: readonly string[]): Promise<string> {
  return run('git', [...gitConfig, ...args])
}

export interface AcquiredCatalogSnapshot {
  readonly commit: string
  readonly path: string
  readonly manifest: CatalogManifest
}

export async function acquireCatalogSnapshot(input: {
  readonly repository: string
  readonly ref: string
  readonly name: string
  readonly dataRoot: string
}): Promise<AcquiredCatalogSnapshot> {
  const name = validateCatalogName(input.name)
  const repository = validateCatalogRepository(input.repository)
  const ref = validateCatalogRef(input.ref)
  const catalogsRoot = join(input.dataRoot, 'catalogs')
  await mkdir(catalogsRoot, { recursive: true, mode: 0o700 })
  const work = await mkdtemp(join(catalogsRoot, '.acquire-'))
  const bare = join(work, 'repository.git')
  const archive = join(work, 'snapshot.tar')
  const candidate = join(work, 'snapshot')
  try {
    await git(['init', '--bare', bare])
    await git([
      `--git-dir=${bare}`,
      'fetch',
      '--no-tags',
      '--no-recurse-submodules',
      '--depth=1',
      repository,
      ref,
    ])
    const commit = await git([
      `--git-dir=${bare}`,
      'rev-parse',
      '--verify',
      'FETCH_HEAD^{commit}',
    ])
    if (!/^[0-9a-f]{40,64}$/.test(commit)) {
      throw new TypeError('Git did not resolve Catalog ref to an exact commit')
    }
    const target = catalogSnapshotPath(input.dataRoot, name, commit)
    if (await Bun.file(join(target, 'ctxindex-catalog.json')).exists()) {
      return {
        commit,
        path: target,
        manifest: await validateCatalogSnapshot(target),
      }
    }
    await mkdir(candidate, { mode: 0o700 })
    await git([
      `--git-dir=${bare}`,
      'archive',
      '--format=tar',
      `--output=${archive}`,
      commit,
    ])
    await run('tar', ['-xf', archive, '-C', candidate])
    const manifest = await validateCatalogSnapshot(candidate)
    await mkdir(join(input.dataRoot, 'catalogs', name), {
      recursive: true,
      mode: 0o700,
    })
    try {
      await rename(candidate, target)
    } catch (cause) {
      const code = (cause as NodeJS.ErrnoException).code
      if (code !== 'EEXIST' && code !== 'ENOTEMPTY') throw cause
      await validateCatalogSnapshot(target)
    }
    return { commit, path: target, manifest }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}
