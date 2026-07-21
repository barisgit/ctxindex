import { chmod, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))

export interface CliResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

export interface CompiledCliHarness {
  run(
    args: readonly string[],
    env: Readonly<Record<string, string | undefined>>,
  ): Promise<CliResult>
  cleanup(): Promise<void>
}

export function isolatedChildEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
}

async function buildExecutable(
  entrypoint: string,
  output: string,
  buildArgs: readonly string[] = [],
) {
  const build = Bun.spawn(
    [
      'bun',
      'build',
      '--compile',
      ...buildArgs,
      entrypoint,
      '--outfile',
      output,
    ],
    { cwd: repoRoot, stdout: 'pipe', stderr: 'pipe' },
  )
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(build.stdout).text(),
    new Response(build.stderr).text(),
    build.exited,
  ])
  if (exitCode !== 0) {
    throw new Error(`Could not compile ${entrypoint}:\n${stdout}\n${stderr}`)
  }
  await chmod(output, 0o755)
}

export interface CompiledCliHarnessOptions {
  readonly cliBuildArgs?: readonly string[]
  readonly daemonBuildArgs?: readonly string[]
}

export async function buildCompiledCliHarness(
  options: CompiledCliHarnessOptions = {},
): Promise<CompiledCliHarness> {
  const dir = await mkdtemp(join(tmpdir(), 'ctxindex-compiled-cli-'))
  const buildDir = join(dir, 'build')
  const relocatedDir = join(dir, 'relocated')
  const builtCliPath = join(buildDir, 'ctxindex')
  const builtDaemonPath = join(buildDir, 'ctxindex-daemon')
  const cliPath = join(relocatedDir, 'ctxindex')
  const daemonPath = join(relocatedDir, 'ctxindex-daemon')
  try {
    await Promise.all([
      mkdir(buildDir, { recursive: true }),
      mkdir(relocatedDir, { recursive: true }),
    ])
    await Promise.all([
      buildExecutable(
        'apps/cli/bin/ctxindex.mjs',
        builtCliPath,
        options.cliBuildArgs,
      ),
      buildExecutable(
        'apps/daemon/src/main.ts',
        builtDaemonPath,
        options.daemonBuildArgs,
      ),
    ])
    await Promise.all([
      Bun.write(cliPath, Bun.file(builtCliPath)),
      Bun.write(daemonPath, Bun.file(builtDaemonPath)),
    ])
    await Promise.all([chmod(cliPath, 0o755), chmod(daemonPath, 0o755)])
    await rm(buildDir, { recursive: true })
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }

  return {
    async run(args, env) {
      const child = Bun.spawn([cliPath, ...args], {
        cwd: '/',
        env: isolatedChildEnvironment(env),
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ])
      return { stdout, stderr, exitCode }
    },
    cleanup: () => rm(dir, { recursive: true, force: true }),
  }
}
