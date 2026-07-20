#!/usr/bin/env bun
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
process.chdir(repoRoot)

const mainFile = 'apps/cli/src/main.ts'
const commandFiles = [
  'apps/cli/src/commands/account.ts',
  'apps/cli/src/commands/oauth-app.ts',
  'apps/cli/src/commands/describe.ts',
  'apps/cli/src/commands/extensions.ts',
  'apps/cli/src/commands/init.ts',
  'apps/cli/src/commands/realm.ts',
  'apps/cli/src/commands/source.ts',
  'apps/cli/src/commands/sync.ts',
  'apps/cli/src/commands/search.ts',
  'apps/cli/src/commands/status.ts',
  'apps/cli/src/commands/secrets.ts',
  'apps/cli/src/commands/skills.ts',
]

async function containsPattern(
  file: string,
  pattern: RegExp,
): Promise<boolean> {
  const source = await Bun.file(resolve(repoRoot, file)).text()
  return pattern.test(source)
}

async function requireGrep(
  patternText: string,
  pattern: RegExp,
  file: string,
): Promise<number> {
  if (!(await containsPattern(file, pattern))) {
    console.error(`cli-framework-citty: missing ${patternText} in ${file}`)
    return 1
  }
  return 0
}

async function rejectGrep(
  patternText: string,
  pattern: RegExp,
  file: string,
): Promise<number> {
  if (await containsPattern(file, pattern)) {
    console.error(`cli-framework-citty: forbidden ${patternText} in ${file}`)
    return 1
  }
  return 0
}

function exitStatus(status: number | null): number {
  return typeof status === 'number' ? status : 1
}

function runNonemptyStdout(label: string, command: string[]): number {
  const [executable, ...args] = command
  if (executable === undefined) return 1

  const result = spawnSync(executable, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  const status = exitStatus(result.status)
  const stdout = typeof result.stdout === 'string' ? result.stdout : ''

  if (status !== 0) {
    process.stdout.write(stdout)
    console.error(`cli-framework-citty: ${label} failed with exit ${status}`)
    return status
  }

  if (stdout.length === 0) {
    console.error(`cli-framework-citty: ${label} produced empty stdout`)
    return 1
  }

  process.stdout.write(stdout)
  return 0
}

function checkUnknownCommand(): number {
  const result = spawnSync(
    'bun',
    ['apps/cli/bin/ctxindex.mjs', 'definitely-not-a-real-command'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const status = exitStatus(result.status)
  if (status !== 0) return 0

  if (typeof result.stdout === 'string') process.stdout.write(result.stdout)
  if (typeof result.stderr === 'string') process.stderr.write(result.stderr)
  console.error('cli-framework-citty: unknown command exited 0')
  return 1
}

async function main(): Promise<number> {
  const mainChecks = [
    await requireGrep("from 'citty'", /from 'citty'/, mainFile),
    await requireGrep('defineCommand\\(', /defineCommand\(/, mainFile),
    await requireGrep('subCommands:', /subCommands:/, mainFile),
    await rejectGrep(
      'helpText|helpByCommand|hasHelpFlag',
      /helpText|helpByCommand|hasHelpFlag/,
      mainFile,
    ),
  ]
  for (const status of mainChecks) {
    if (status !== 0) return status
  }

  for (const file of commandFiles) {
    const status = await requireGrep(
      'defineCommand\\(',
      /defineCommand\(/,
      file,
    )
    if (status !== 0) return status
  }

  for (const [label, command] of [
    ['help', ['bun', 'apps/cli/bin/ctxindex.mjs', '--help']],
    ['version', ['bun', 'apps/cli/bin/ctxindex.mjs', '--version']],
    [
      'oauth-app-help',
      ['bun', 'apps/cli/bin/ctxindex.mjs', 'oauth-app', '--help'],
    ],
    ['account-help', ['bun', 'apps/cli/bin/ctxindex.mjs', 'account', '--help']],
  ] as const) {
    const status = runNonemptyStdout(label, command)
    if (status !== 0) return status
  }

  const unknownStatus = checkUnknownCommand()
  if (unknownStatus !== 0) return unknownStatus

  console.log('cli-framework-citty: citty framework checks passed')
  return 0
}

process.exit(await main())
