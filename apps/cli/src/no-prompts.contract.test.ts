/**
 * VAL-NO-PROMPTS contract test.
 *
 * Every v1 command must:
 * 1. Accept required input via flags / env (not TTY prompts).
 * 2. When called with missing required input and stdin=/dev/null,
 *    fail fast (non-zero exit) with an actionable error — never hang.
 */
import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const repoRoot = new URL('../../../', import.meta.url).pathname
const cliBin = join(repoRoot, 'apps/cli/bin/ctxindex.mjs')
const TIMEOUT_MS = 5000

async function spawnCli(
  args: string[],
  env: Record<string, string | undefined> = {},
  stdinMode: 'null' | 'pipe' = 'null',
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, cliBin, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: stdinMode === 'null' ? null : 'pipe',
  })

  const exitCode = await Promise.race([
    proc.exited,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `CLI hung after ${TIMEOUT_MS}ms for: ctxindex ${args.join(' ')}`,
            ),
          ),
        TIMEOUT_MS,
      ),
    ),
  ])

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  return { exitCode, stdout, stderr }
}

async function mkSandbox(): Promise<{
  env: Record<string, string | undefined>
  cleanup: () => Promise<void>
}> {
  const dir = await mkdtemp(join(tmpdir(), 'ctxindex-noprompts-'))
  const env: Record<string, string | undefined> = {
    XDG_CONFIG_HOME: join(dir, 'config'),
    XDG_DATA_HOME: join(dir, 'data'),
    XDG_STATE_HOME: join(dir, 'state'),
    XDG_CACHE_HOME: join(dir, 'cache'),
    CTXINDEX_CONFIG_HOME: undefined,
    CTXINDEX_DATA_HOME: undefined,
    CTXINDEX_STATE_HOME: undefined,
    CTXINDEX_CACHE_HOME: undefined,
    CTXINDEX_GOOGLE_CLIENT_ID: '',
    CTXINDEX_GOOGLE_CLIENT_SECRET: '',
  }
  await mkdir(join(dir, 'config'), { recursive: true })
  await mkdir(join(dir, 'data'), { recursive: true })
  // bootstrap the DB
  await spawnCli(['init'], env, 'null')
  return { env, cleanup: () => rm(dir, { recursive: true, force: true }) }
}

describe('no-prompts contract', () => {
  // ---------------------------------------------------------------------------
  // Commands that succeed with no required input
  // ---------------------------------------------------------------------------
  test('init: exits 0 with stdin=null', async () => {
    const { env, cleanup } = await mkSandbox()
    try {
      const { exitCode } = await spawnCli(['init'], env, 'null')
      expect(exitCode).toBe(0)
    } finally {
      await cleanup()
    }
  })

  test('account add: unavailable explicit OAuth App exits with safe guidance without prompting', async () => {
    const { env, cleanup } = await mkSandbox()
    try {
      const { exitCode, stderr } = await spawnCli(
        ['account', 'add', 'google', '--app', 'missing'],
        env,
        'null',
      )
      expect(exitCode).toBe(2)
      expect(stderr).toContain('Available labels: ctxindex')
    } finally {
      await cleanup()
    }
  })

  test('auth: deleted command exits non-zero without prompting', async () => {
    const { env, cleanup } = await mkSandbox()
    try {
      const { exitCode, stderr } = await spawnCli(['auth'], env, 'null')
      expect(exitCode).toBe(2)
      expect(stderr).toContain('unknown command auth')
    } finally {
      await cleanup()
    }
  })

  test('registry inspection: exits 0 with stdin=null', async () => {
    const { env, cleanup } = await mkSandbox()
    try {
      for (const args of [['describe'], ['extension', 'list']]) {
        const { exitCode } = await spawnCli(args, env, 'null')
        expect(exitCode).toBe(0)
      }
    } finally {
      await cleanup()
    }
  })

  test('realm list: exits 0 with stdin=null', async () => {
    const { env, cleanup } = await mkSandbox()
    try {
      const { exitCode } = await spawnCli(['realm', 'list'], env, 'null')
      expect(exitCode).toBe(0)
    } finally {
      await cleanup()
    }
  })

  test('source list: exits 0 with stdin=null', async () => {
    const { env, cleanup } = await mkSandbox()
    try {
      const { exitCode } = await spawnCli(['source', 'list'], env, 'null')
      expect(exitCode).toBe(0)
    } finally {
      await cleanup()
    }
  })

  test('status: exits 0 with stdin=null', async () => {
    const { env, cleanup } = await mkSandbox()
    try {
      const { exitCode } = await spawnCli(['status'], env, 'null')
      expect(exitCode).toBe(0)
    } finally {
      await cleanup()
    }
  })

  test('docs get-skill: exits 0 with stdin=null', async () => {
    const { env, cleanup } = await mkSandbox()
    try {
      const { exitCode, stdout, stderr } = await spawnCli(
        ['docs', 'get-skill'],
        env,
        'null',
      )
      expect(exitCode).toBe(0)
      expect(stdout).toContain('name: ctxindex')
      expect(stderr).toBe('')
    } finally {
      await cleanup()
    }
  })

  // ---------------------------------------------------------------------------
  // Commands that require args — must fail fast (non-zero), not hang
  // ---------------------------------------------------------------------------
  test('action run: missing required input exits non-zero without prompting', async () => {
    const { env, cleanup } = await mkSandbox()
    try {
      const { exitCode, stderr } = await spawnCli(
        ['action', 'run'],
        env,
        'null',
      )
      expect(exitCode).not.toBe(0)
      expect(stderr.length).toBeGreaterThan(0)
    } finally {
      await cleanup()
    }
  })

  test('realm add (missing slug): exits non-zero fast', async () => {
    const { env, cleanup } = await mkSandbox()
    try {
      const { exitCode, stderr } = await spawnCli(['realm', 'add'], env, 'null')
      expect(exitCode).not.toBe(0)
      expect(stderr.length).toBeGreaterThan(0)
    } finally {
      await cleanup()
    }
  })

  test('source add (missing adapter-id): exits non-zero fast', async () => {
    const { env, cleanup } = await mkSandbox()
    try {
      const { exitCode, stderr } = await spawnCli(
        ['source', 'add'],
        env,
        'null',
      )
      expect(exitCode).not.toBe(0)
      expect(stderr.length).toBeGreaterThan(0)
    } finally {
      await cleanup()
    }
  })

  test('source add --realm unknown: exits 2 with actionable message', async () => {
    const { env, cleanup } = await mkSandbox()
    try {
      const { exitCode, stderr } = await spawnCli(
        [
          'source',
          'add',
          'local.directory',
          '--realm',
          'unknown',
          '--config-root-path',
          '/tmp',
        ],
        env,
        'null',
      )
      expect(exitCode).toBe(2)
      expect(stderr).toContain('unknown realm')
      expect(stderr).toContain('ctxindex realm add unknown')
    } finally {
      await cleanup()
    }
  })

  test('source remove (missing id): exits non-zero fast', async () => {
    const { env, cleanup } = await mkSandbox()
    try {
      const { exitCode, stderr } = await spawnCli(
        ['source', 'remove'],
        env,
        'null',
      )
      expect(exitCode).not.toBe(0)
      expect(stderr.length).toBeGreaterThan(0)
    } finally {
      await cleanup()
    }
  })

  test('source remove (unknown id): exits 2 with actionable message', async () => {
    const { env, cleanup } = await mkSandbox()
    try {
      const { exitCode, stderr } = await spawnCli(
        ['source', 'remove', 'nonexistent-source-id'],
        env,
        'null',
      )
      expect(exitCode).toBe(2)
      expect(stderr.length).toBeGreaterThan(0)
    } finally {
      await cleanup()
    }
  })

  test('removed skills command exits non-zero fast', async () => {
    const { env, cleanup } = await mkSandbox()
    try {
      const { exitCode, stderr } = await spawnCli(['skills'], env, 'null')
      expect(exitCode).toBe(2)
      expect(stderr).toContain('unknown command skills')
    } finally {
      await cleanup()
    }
  })

  test('OAuth App add: missing configuration exits non-zero without prompting', async () => {
    const { env, cleanup } = await mkSandbox()
    try {
      const { exitCode, stderr } = await spawnCli(
        ['oauth-app', 'add', 'google', 'desktop', '--from-env'],
        env,
        'null',
      )
      expect(exitCode).not.toBe(0)
      expect(stderr.length).toBeGreaterThan(0)
    } finally {
      await cleanup()
    }
  })

  test('sync: no Sources exits 0 without prompting', async () => {
    const { env, cleanup } = await mkSandbox()
    try {
      const { exitCode, stderr } = await spawnCli(['sync'], env, 'null')
      expect(exitCode).toBe(0)
      expect(stderr).toBe('')
    } finally {
      await cleanup()
    }
  })
})
