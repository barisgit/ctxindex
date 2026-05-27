import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const wrapperPath = join(repoRoot, 'scripts/with-timeout.ts')
const tempDirs: string[] = []

type RunOptions = {
  env?: Record<string, string>
  timeoutMs?: number
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ctxindex-with-timeout-'))
  tempDirs.push(dir)
  return dir
}

async function runWrapper(
  args: string[],
  options: RunOptions = {},
): Promise<{
  exitCode: number
  stdout: string
  stderr: string
  elapsedMs: number
}> {
  const start = performance.now()
  const proc = Bun.spawn([process.execPath, wrapperPath, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...options.env },
    stdin: null,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const exitCode = await waitForExit(
    proc,
    options.timeoutMs ?? 7000,
    `with-timeout ${args.join(' ')}`,
  )
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  return { exitCode, stdout, stderr, elapsedMs: performance.now() - start }
}

async function waitForExit(
  proc: ReturnType<typeof Bun.spawn>,
  timeoutMs: number,
  label: string,
): Promise<number> {
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      proc.exited,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(new Error(`${label} did not exit within ${timeoutMs}ms`)),
          timeoutMs,
        )
      }),
    ])
  } catch (error) {
    proc.kill('SIGTERM')
    throw error
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function waitForFile(path: string, timeoutMs = 3000): Promise<void> {
  const deadline = performance.now() + timeoutMs
  while (performance.now() < deadline) {
    try {
      await readFile(path, 'utf8')
      return
    } catch {
      await sleep(20)
    }
  }

  throw new Error(`Timed out waiting for file: ${path}`)
}

async function waitForProcessGone(
  pid: number,
  timeoutMs = 3000,
): Promise<void> {
  const deadline = performance.now() + timeoutMs
  while (performance.now() < deadline) {
    if (!processExists(pid)) return
    await sleep(50)
  }

  throw new Error(`Process ${pid} still exists after ${timeoutMs}ms`)
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'ESRCH'
    ) {
      return false
    }
    return true
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

test('exit 0 passthrough', async () => {
  const result = await runWrapper([
    '2',
    process.execPath,
    '-e',
    'setTimeout(() => process.exit(0), 100)',
  ])

  expect(result.exitCode).toBe(0)
})

test('exit 42 passthrough', async () => {
  const result = await runWrapper([
    '2',
    '--',
    process.execPath,
    '-e',
    'process.exit(42)',
  ])

  expect(result.exitCode).toBe(42)
})

test('timeout exits 124', async () => {
  const result = await runWrapper(['0.3', '--', 'bash', '-c', 'sleep 5'])

  expect(result.exitCode).toBe(124)
  expect(result.elapsedMs).toBeLessThan(2000)
})

test('SIGINT propagates to child', async () => {
  const dir = await makeTempDir()
  const readyFile = join(dir, 'ready')
  const signalFile = join(dir, 'signal')
  const childScript = `
const { READY_FILE, SIGNAL_FILE } = process.env
process.on('SIGINT', () => {
  Bun.write(SIGNAL_FILE, 'saw-sigint').then(() => process.exit(0))
})
await Bun.write(READY_FILE, 'ready')
setInterval(() => {}, 1000)
`
  const proc = Bun.spawn(
    [
      process.execPath,
      wrapperPath,
      '10',
      '--',
      process.execPath,
      '-e',
      childScript,
    ],
    {
      cwd: repoRoot,
      env: { ...process.env, READY_FILE: readyFile, SIGNAL_FILE: signalFile },
      stdin: null,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )

  await waitForFile(readyFile)
  process.kill(proc.pid, 'SIGINT')
  const exitCode = await waitForExit(proc, 3000, 'SIGINT propagation test')
  await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  expect(exitCode).toBe(130)
  expect(await readFile(signalFile, 'utf8')).toBe('saw-sigint')
})

test('TEST_WALL_TIMEOUT_SECS precedence', async () => {
  const result = await runWrapper(['60', '--', 'bash', '-c', 'sleep 5'], {
    env: { TEST_WALL_TIMEOUT_SECS: '0.3' },
  })

  expect(result.exitCode).toBe(124)
  expect(result.elapsedMs).toBeLessThan(2000)
})

test('process group kill', async () => {
  const dir = await makeTempDir()
  const pidFile = join(dir, 'grandchild.pid')
  const childScript = `
trap 'exit 0' TERM
bash -c 'trap "" TERM; echo $$ > "$PID_FILE"; while true; do sleep 1; done' &
while true; do sleep 1; done
`
  const result = await runWrapper(['0.3', '--', 'bash', '-c', childScript], {
    env: { PID_FILE: pidFile },
    timeoutMs: 8000,
  })
  const grandchildPid = Number((await readFile(pidFile, 'utf8')).trim())

  expect(result.exitCode).toBe(124)
  expect(result.elapsedMs).toBeGreaterThanOrEqual(5000)
  expect(Number.isInteger(grandchildPid)).toBe(true)
  await waitForProcessGone(grandchildPid)
}, 10000)
