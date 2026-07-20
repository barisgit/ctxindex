import {
  cp,
  mkdir,
  readFile,
  rename,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = resolve(
  fileURLToPath(new URL('../../../../../../', import.meta.url)),
)

const fixtureRoot = resolve(fileURLToPath(new URL('.', import.meta.url)))

export interface ProcessResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

export async function runProcess(
  command: readonly string[],
  options: {
    readonly cwd: string
    readonly env?: Record<string, string | undefined>
  },
): Promise<ProcessResult> {
  const child = Bun.spawn([...command], {
    cwd: options.cwd,
    ...(options.env === undefined ? {} : { env: options.env }),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { stdout, stderr, exitCode }
}

export async function git(
  cwd: string,
  args: readonly string[],
): Promise<string> {
  const result = await runProcess(['git', ...args], {
    cwd,
    env: process.env.PATH === undefined ? {} : { PATH: process.env.PATH },
  })
  if (result.exitCode !== 0) throw new Error(result.stderr)
  return result.stdout.trim()
}

export async function commitAll(
  repository: string,
  message: string,
): Promise<string> {
  await git(repository, ['add', '.'])
  await git(repository, [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-m',
    message,
  ])
  return git(repository, ['rev-parse', 'HEAD'])
}

export async function commitEmpty(
  repository: string,
  message: string,
): Promise<string> {
  await git(repository, [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--allow-empty',
    '-m',
    message,
  ])
  return git(repository, ['rev-parse', 'HEAD'])
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (cause) {
    if ((cause as { code?: unknown }).code === 'ENOENT') return false
    throw cause
  }
}

export async function relocateRoot(
  source: string,
  destination: string,
): Promise<void> {
  await mkdir(resolve(destination, '..'), { recursive: true })
  if (await exists(source)) {
    await rename(source, destination)
    return
  }
  await mkdir(destination, { recursive: true })
}

export async function prepareGitExtensionRepository(
  sandboxRoot: string,
): Promise<string> {
  const worktree = join(sandboxRoot, 'git-extension-worktree')
  const bareRepository = join(sandboxRoot, 'git-extension.git')
  await cp(join(fixtureRoot, 'git'), worktree, { recursive: true })
  await git(worktree, ['init', '-b', 'main'])
  await commitAll(worktree, 'Git Extension fixture')
  await git(sandboxRoot, ['clone', '--bare', worktree, bareRepository])
  await git(sandboxRoot, ['--git-dir', bareRepository, 'update-server-info'])
  return bareRepository
}

export interface GitFixtureServer {
  readonly target: string
  readonly requestCount: () => number
  close(): Promise<void>
}

export async function startGitFixtureServer(
  bareRepository: string,
): Promise<GitFixtureServer> {
  let requests = 0
  const server = createServer(async (request, response) => {
    requests += 1
    try {
      const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
      const prefix = '/extension.git/'
      if (!pathname.startsWith(prefix)) {
        response.writeHead(404).end()
        return
      }
      const relativePath = decodeURIComponent(pathname.slice(prefix.length))
      if (
        relativePath.length === 0 ||
        relativePath.includes('..') ||
        relativePath.includes('\\')
      ) {
        response.writeHead(400).end()
        return
      }
      response.writeHead(200)
      response.end(await readFile(join(bareRepository, relativePath)))
    } catch (cause) {
      if ((cause as { code?: unknown }).code === 'ENOENT') {
        response.writeHead(404).end()
        return
      }
      response.writeHead(500).end()
    }
  })
  await new Promise<void>((resolveListening, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolveListening())
  })
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('Git fixture server did not bind a TCP port')
  }
  const commit = await git(bareRepository, ['rev-parse', 'refs/heads/main'])
  return {
    target: `git+http://127.0.0.1:${address.port}/extension.git#${commit}`,
    requestCount: () => requests,
    close: () =>
      new Promise<void>((resolveClose, reject) => {
        server.close((error) =>
          error === undefined ? resolveClose() : reject(error),
        )
      }),
  }
}

export async function prepareCatalogAuthorRepository(input: {
  readonly repository: string
  readonly gitTarget: string
  readonly marker: string
}): Promise<void> {
  const { repository, gitTarget, marker } = input
  await mkdir(repository, { recursive: true })
  await mkdir(join(repository, 'dist'), { recursive: true })
  await mkdir(join(repository, 'packages'), { recursive: true })
  const sdkLink = join(repository, 'node_modules', '@ctxindex', 'extension-sdk')
  if (!(await exists(sdkLink))) {
    await mkdir(join(repository, 'node_modules', '@ctxindex'), {
      recursive: true,
    })
    await symlink(join(repoRoot, 'packages', 'extension-sdk'), sdkLink, 'dir')
  }
  if (!(await exists(join(repository, 'package.json')))) {
    await cp(
      join(fixtureRoot, 'author', 'package.json'),
      join(repository, 'package.json'),
    )
  }
  if (!(await exists(join(repository, 'packages', 'local')))) {
    await cp(
      join(fixtureRoot, 'local'),
      join(repository, 'packages', 'local'),
      {
        recursive: true,
      },
    )
  }
  const source = (
    await readFile(join(fixtureRoot, 'author', 'index.ts'), 'utf8')
  )
    .replace('__BUILD_MARKER__', marker)
    .replace('__GIT_TARGET__', gitTarget)
  await writeFile(join(repository, 'index.ts'), source)
  const build = await runProcess(
    [
      'bun',
      'build',
      join(repository, 'index.ts'),
      '--outfile',
      join(repository, 'dist', 'index.js'),
      '--target=bun',
    ],
    { cwd: repoRoot },
  )
  if (build.exitCode !== 0) {
    throw new Error(
      `Catalog fixture bundle failed:\n${build.stdout}\n${build.stderr}`,
    )
  }
}
