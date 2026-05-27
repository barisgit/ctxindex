import { type CommandDef, defineCommand, runMain } from 'citty'
import pkg from '../package.json' with { type: 'json' }
import { authCommand } from './commands/auth'
import { initCommand } from './commands/init'
import { realmCommand } from './commands/realm'
import { searchCommand } from './commands/search'
import { secretsCommand } from './commands/secrets'
import { skillsCommand } from './commands/skills'
import { sourceCommand } from './commands/source'
import { statusCommand } from './commands/status'
import { syncCommand } from './commands/sync'
import { mapErrorToExit } from './format/exit'

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
    auth: authCommand,
    realm: realmCommand,
    source: sourceCommand,
    sync: syncCommand,
    search: searchCommand,
    status: statusCommand,
    secrets: secretsCommand,
    skills: skillsCommand,
  },
})

export async function runCli(args: string[]): Promise<number> {
  process.exitCode = 0
  const restoreExit = captureProcessExit()
  try {
    await runMain(rootCommand, {
      rawArgs: args.length === 0 ? ['--help'] : args,
    })
  } finally {
    restoreExit()
  }
  const exitCode = Number(process.exitCode ?? 0)
  return exitCode === 1
    ? (cittyCommandSelectionExit(args) ?? exitCode)
    : exitCode
}
