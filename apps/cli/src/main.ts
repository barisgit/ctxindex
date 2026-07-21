import { runMain } from 'citty'
import {
  defineCtxCommand,
  normalizeBuiltinFlagValues,
  prepareCommandTree,
  renderCommandUsage,
  validateCommandInvocation,
} from './command-model'
import { accountCommand } from './commands/account'
import { actionCommand } from './commands/action'
import { artifactCommand } from './commands/artifact'
import { describeCommand } from './commands/describe'
import { docsCommand } from './commands/docs'
import { exportCommand } from './commands/export'
import { extensionCommand } from './commands/extensions'
import { getCommand } from './commands/get'
import { initCommand } from './commands/init'
import { oauthAppCommand } from './commands/oauth-app'
import { realmCommand } from './commands/realm'
import { searchCommand } from './commands/search'
import { secretsCommand } from './commands/secrets'
import { createSourceCommandRuntime, sourceCommand } from './commands/source'
import { statusCommand } from './commands/status'
import { syncCommand } from './commands/sync'
import { threadCommand } from './commands/thread'
import { daemonCommand } from './daemon/command'
import { setCliLogLevel } from './deps'
import { mapErrorToExit } from './format/exit'
import type { SourceCommandDeps } from './source/handle-source-command'

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const
type LogLevelName = (typeof LOG_LEVELS)[number]

declare const __CTXINDEX_VERSION__: string
const cliVersion =
  typeof __CTXINDEX_VERSION__ === 'string' ? __CTXINDEX_VERSION__ : '0.0.0'

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

export function createRootCommand(
  source = sourceCommand,
  version = cliVersion,
) {
  return defineCtxCommand({
    meta: {
      name: 'ctxindex',
      version,
      description:
        'Give shell-capable agents one local, typed interface to your personal context.',
    },
    args: {
      'log-level': {
        type: 'enum',
        options: [...LOG_LEVELS],
        description: 'Diagnostic verbosity',
      },
    },
    setup: ({ args }) => {
      setCliLogLevel(args['log-level'] as LogLevelName | undefined)
    },
    subCommands: {
      init: initCommand,
      account: accountCommand,
      'oauth-app': oauthAppCommand,
      describe: describeCommand,
      docs: docsCommand,
      daemon: daemonCommand,
      extension: extensionCommand,
      action: actionCommand,
      artifact: artifactCommand,
      realm: realmCommand,
      source: source,
      sync: syncCommand,
      get: getCommand,
      export: exportCommand,
      thread: threadCommand,
      search: searchCommand,
      status: statusCommand,
      secrets: secretsCommand,
    },
  })
}

export const rootCommand = createRootCommand()

export interface RunCliDeps {
  readonly source?: SourceCommandDeps
}

export async function runCli(
  args: string[],
  deps: RunCliDeps = {},
): Promise<number> {
  process.exitCode = 0
  const sourceRuntime = createSourceCommandRuntime(
    args[0] === 'source' ? args.slice(1) : [],
    deps.source,
  )
  const invocationCommand = createRootCommand(sourceRuntime.command)
  await prepareCommandTree(invocationCommand)
  const normalizedArgs = await normalizeBuiltinFlagValues(
    invocationCommand,
    args,
  )
  let usageRendered = false

  const restoreExit = captureProcessExit()
  try {
    const invocationError = await validateCommandInvocation(
      invocationCommand,
      normalizedArgs,
    )
    if (invocationError !== undefined) {
      console.error(invocationError)
      return 2
    }
    await runMain(invocationCommand, {
      rawArgs: normalizedArgs.length === 0 ? ['--help'] : normalizedArgs,
      showUsage: async (command) => {
        usageRendered = true
        console.log(await renderCommandUsage(command))
      },
    })
  } finally {
    await sourceRuntime.close()
    restoreExit()
  }
  const exitCode = Number(process.exitCode ?? 0)
  const sourceRouteError = sourceRuntime.error()
  if (exitCode === 1 && sourceRouteError !== undefined) {
    return mapErrorToExit(sourceRouteError)
  }
  if (exitCode !== 1) return exitCode
  return usageRendered ? mapErrorToExit({ code: 'invalid_args' }) : 50
}
