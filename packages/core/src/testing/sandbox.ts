import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface SandboxEnv {
  readonly CTXINDEX_CONFIG_HOME: string
  readonly CTXINDEX_DATA_HOME: string
  readonly CTXINDEX_CACHE_HOME: string
  readonly CTXINDEX_STATE_HOME: string
  readonly PATH?: string
  readonly [key: string]: string | undefined
}

export interface SandboxRunOptions {
  readonly stdin?: string | Blob | Uint8Array | ReadableStream
  readonly env?: Record<string, string | undefined>
  readonly cwd?: string
}

export interface SandboxRunResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
  readonly durationMs: number
}

export interface Sandbox {
  readonly dir: string
  readonly env: SandboxEnv
  run(args: string[], opts?: SandboxRunOptions): Promise<SandboxRunResult>
  cleanup(): Promise<void>
}

const repoRoot = resolve(
  fileURLToPath(new URL('../../../../', import.meta.url)),
)
const cliBin = join(repoRoot, 'apps/cli/bin/ctxindex.mjs')

function baseEnv(dir: string): SandboxEnv {
  const env = {
    CTXINDEX_CONFIG_HOME: join(dir, 'config'),
    CTXINDEX_DATA_HOME: join(dir, 'data'),
    CTXINDEX_CACHE_HOME: join(dir, 'cache'),
    CTXINDEX_STATE_HOME: join(dir, 'state'),
    CTXINDEX_KEYTAR_MOCK_FILE: join(dir, 'keytar-mock.json'),
  }

  if (process.env.PATH === undefined) return env

  return { ...env, PATH: process.env.PATH }
}

function stdinForSpawn(
  stdin: SandboxRunOptions['stdin'],
): 'ignore' | Blob | Uint8Array | ReadableStream {
  if (stdin === undefined) return 'ignore'
  if (typeof stdin === 'string') return new Blob([stdin])
  return stdin
}

export async function createSandbox(): Promise<Sandbox> {
  const dir = await mkdtemp(join(tmpdir(), 'ctxindex-sandbox-'))
  const env = baseEnv(dir)
  let cleaned = false

  async function run(
    args: string[],
    opts: SandboxRunOptions = {},
  ): Promise<SandboxRunResult> {
    const startedAt = performance.now()
    const proc = Bun.spawn(['bun', cliBin, ...args], {
      cwd: opts.cwd ?? repoRoot,
      env: { ...env, ...opts.env },
      stdin: stdinForSpawn(opts.stdin),
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])

    return {
      exitCode,
      stdout,
      stderr,
      durationMs: performance.now() - startedAt,
    }
  }

  async function cleanup(): Promise<void> {
    if (cleaned) return
    cleaned = true
    await rm(dir, { recursive: true, force: true })
  }

  return { dir, env, run, cleanup }
}
