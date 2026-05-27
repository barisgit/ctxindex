#!/usr/bin/env bun

const EXIT_USAGE = 2
const EXIT_TIMEOUT = 124
const EXIT_SIGINT = 130
const EXIT_SIGTERM = 143
const KILL_GRACE_MS = 5000
const PROCESS_GROUP_POLL_MS = 50

type Signal = 'SIGINT' | 'SIGTERM' | 'SIGKILL'

function printUsage(message?: string): never {
  if (message) process.stderr.write(`${message}\n`)
  process.stderr.write(
    'Usage: bun scripts/with-timeout.ts <timeoutSecs> [--] <cmd> [args...]\n',
  )
  process.exit(EXIT_USAGE)
}

function parseSeconds(value: string | undefined, label: string): number {
  if (value === undefined || value.trim() === '') {
    printUsage(`Missing ${label}`)
  }

  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) {
    printUsage(`${label} must be a positive number`)
  }

  return seconds
}

const args = process.argv.slice(2)
const cliTimeoutSecs = parseSeconds(args[0], 'timeoutSecs')
const envTimeoutSecs = process.env.TEST_WALL_TIMEOUT_SECS
const timeoutSecs =
  envTimeoutSecs !== undefined
    ? parseSeconds(envTimeoutSecs, 'TEST_WALL_TIMEOUT_SECS')
    : cliTimeoutSecs
const command = args[1] === '--' ? args.slice(2) : args.slice(1)

if (command.length === 0) {
  printUsage('Missing command')
}

const child = Bun.spawn(command, {
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
  detached: process.platform !== 'win32',
})

let mode: 'normal' | 'timeout' | 'sigint' | 'sigterm' = 'normal'
let didExit = false
const timeoutTimer = setTimeout(() => {
  if (mode !== 'normal') return

  mode = 'timeout'
  void finishTimeout()
}, timeoutSecs * 1000)

function signalChild(signal: Signal): void {
  const target = process.platform === 'win32' ? child.pid : -child.pid

  try {
    process.kill(target, signal)
  } catch (error) {
    if (!isMissingProcess(error)) {
      process.stderr.write(
        `with-timeout: failed to send ${signal} to child ${child.pid}: ${String(error)}\n`,
      )
    }
  }
}

function isMissingProcess(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ESRCH'
  )
}

function processGroupExists(): boolean {
  const target = process.platform === 'win32' ? child.pid : -child.pid

  try {
    process.kill(target, 0)
    return true
  } catch (error) {
    return !isMissingProcess(error)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForChild(): Promise<void> {
  try {
    await child.exited
  } catch {
    /* ignore */
  }
}

async function finishTimeout(): Promise<void> {
  signalChild('SIGTERM')

  const deadline = performance.now() + KILL_GRACE_MS
  let childExited = false
  void child.exited.then(
    () => {
      childExited = true
    },
    () => {
      childExited = true
    },
  )

  while (performance.now() < deadline) {
    if (childExited && !processGroupExists()) {
      exitNow(EXIT_TIMEOUT)
    }

    const remainingMs = deadline - performance.now()
    await sleep(Math.min(PROCESS_GROUP_POLL_MS, remainingMs))
  }

  if (processGroupExists()) signalChild('SIGKILL')
  await waitForChild()
  exitNow(EXIT_TIMEOUT)
}

function exitNow(code: number): never {
  if (didExit) {
    return undefined as never
  }

  didExit = true
  clearTimeout(timeoutTimer)
  process.exit(code)
}

function exitAfterChild(code: number): void {
  void child.exited.then(
    () => exitNow(code),
    () => exitNow(code),
  )
}

process.once('SIGINT', () => {
  if (mode !== 'normal') return

  mode = 'sigint'
  signalChild('SIGINT')
  exitAfterChild(EXIT_SIGINT)
})

process.once('SIGTERM', () => {
  if (mode !== 'normal') return

  mode = 'sigterm'
  signalChild('SIGTERM')
  exitAfterChild(EXIT_SIGTERM)
})

void child.exited.then((exitCode) => {
  if (mode !== 'normal') return
  exitNow(exitCode)
})
