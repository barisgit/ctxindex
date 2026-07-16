import { type CommandDef, defineCommand, runMain, showUsage } from 'citty'
import pkg from '../package.json' with { type: 'json' }
import { actionCommand } from './commands/action'
import { artifactCommand } from './commands/artifact'
import { authCommand } from './commands/auth'
import { describeCommand } from './commands/describe'
import { exportCommand } from './commands/export'
import { extensionsCommand } from './commands/extensions'
import { getCommand } from './commands/get'
import { initCommand } from './commands/init'
import { purgeCommand } from './commands/purge'
import { realmCommand } from './commands/realm'
import { searchCommand } from './commands/search'
import { secretsCommand } from './commands/secrets'
import { skillsCommand } from './commands/skills'
import { sourceCommand } from './commands/source'
import { statusCommand } from './commands/status'
import { syncCommand } from './commands/sync'
import { threadCommand } from './commands/thread'
import { loadCliDefinitions, printExtensionDiagnostics } from './definitions'
import { setCliLogLevel } from './deps'
import { mapErrorToExit } from './format/exit'
import { formatRegistryText } from './format/registry'

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const
type LogLevelName = (typeof LOG_LEVELS)[number]

function isLogLevelName(value: string): value is LogLevelName {
  return (LOG_LEVELS as readonly string[]).includes(value)
}

/**
 * Extracts the global `--log-level <level>` / `--log-level=<level>` flag and
 * strips it from the args so per-command parsers never see it (V1 §1.8).
 */
function extractLogLevel(args: string[]): {
  rest: string[]
  level?: string
  error?: string
} {
  const rest: string[] = []
  let level: string | undefined
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === undefined) continue
    if (arg === '--log-level') {
      const value = args[i + 1]
      if (value === undefined)
        return { rest, error: '--log-level requires a value' }
      level = value
      i++
    } else if (arg.startsWith('--log-level=')) {
      level = arg.slice('--log-level='.length)
    } else {
      rest.push(arg)
    }
  }
  if (level !== undefined && !isLogLevelName(level)) {
    return {
      rest,
      error: `invalid --log-level: ${level} (expected ${LOG_LEVELS.join('|')})`,
    }
  }
  return level === undefined ? { rest } : { rest, level }
}

function staticSubCommands(
  command: CommandDef,
): Record<string, CommandDef> | undefined {
  return command.subCommands && typeof command.subCommands === 'object'
    ? (command.subCommands as Record<string, CommandDef>)
    : undefined
}

function cittyCommandSelectionExit(args: string[]): number | undefined {
  const commandIndex = args.findIndex((arg) => !arg.startsWith('-'))
  if (commandIndex === -1) return undefined
  const commandName = args[commandIndex]
  if (commandName === undefined) return undefined

  const command = staticSubCommands(rootCommand)?.[commandName]
  if (!command) return mapErrorToExit({ code: 'invalid_args' })

  const subCommands = staticSubCommands(command)
  if (!subCommands) return undefined

  const subCommandName = args
    .slice(commandIndex + 1)
    .find((arg) => !arg.startsWith('-'))
  return subCommandName && subCommands[subCommandName]
    ? undefined
    : mapErrorToExit({ code: 'invalid_args' })
}

function captureProcessExit(): () => void {
  const originalExit = process.exit
  process.exit = ((code?: string | number | null) => {
    if (typeof code === 'number') process.exitCode = code
    else if (typeof code === 'string') process.exitCode = Number(code)
  }) as typeof process.exit
  return () => {
    process.exit = originalExit
  }
}

export const rootCommand = defineCommand({
  meta: {
    name: 'ctxindex',
    version: pkg.version ?? '0.0.0',
    description: 'Local context indexing CLI',
  },
  subCommands: {
    init: initCommand,
    describe: describeCommand,
    extensions: extensionsCommand,
    action: actionCommand,
    auth: authCommand,
    artifact: artifactCommand,
    purge: purgeCommand,
    realm: realmCommand,
    source: sourceCommand,
    sync: syncCommand,
    get: getCommand,
    export: exportCommand,
    thread: threadCommand,
    search: searchCommand,
    status: statusCommand,
    secrets: secretsCommand,
    skills: skillsCommand,
  },
})

export async function runCli(args: string[]): Promise<number> {
  process.exitCode = 0
  const { rest, level, error } = extractLogLevel(args)
  if (error) {
    console.error(error)
    return 2
  }
  setCliLogLevel(
    isLogLevelName(level ?? '') ? (level as LogLevelName) : undefined,
  )

  const restoreExit = captureProcessExit()
  try {
    await runMain(rootCommand, {
      rawArgs: rest.length === 0 ? ['--help'] : rest,
      showUsage: async (command, parent) => {
        await showUsage(command, parent)
        const definitions = await loadCliDefinitions()
        printExtensionDiagnostics(definitions.diagnostics)
        console.log(
          `\nLoaded interface:\n${formatRegistryText(definitions.description)}`,
        )
      },
    })
  } finally {
    restoreExit()
  }
  const exitCode = Number(process.exitCode ?? 0)
  return exitCode === 1
    ? (cittyCommandSelectionExit(rest) ?? exitCode)
    : exitCode
}
