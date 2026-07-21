import type { CommandDef } from 'citty'
import {
  needsDynamicSourceArgs,
  resolveSourceAdapterId,
  sourceAddArgs,
  sourceListArgs,
  sourceRemoveArgs,
} from '../args/source'
import { defineCtxCommand } from '../command-model'
import { runWithExit } from '../format/exit'
import { resolveOutputFormat } from '../format/output'
import {
  defaultSourceCommandDeps,
  handleSourceCommand,
  retainSourceCommandRoute,
  type SourceCommandDeps,
  sourceHelpDescriptions,
} from '../source/handle-source-command'

export interface SourceCommandRuntime {
  readonly command: CommandDef
  close(): Promise<void>
  error(): unknown
}

export function createSourceCommandRuntime(
  invocationArgs: string[] = [],
  services: SourceCommandDeps = defaultSourceCommandDeps,
): SourceCommandRuntime {
  const retained = retainSourceCommandRoute(
    invocationArgs[0] === 'add',
    services,
  )
  const route = retained.resolve
  let retainedHelpDescriptions:
    | Promise<Awaited<ReturnType<typeof sourceHelpDescriptions>>>
    | undefined
  const helpDescriptions = () =>
    (retainedHelpDescriptions ??= sourceHelpDescriptions(services))
  const activeSourceDescriptions = async () => {
    if (!needsDynamicSourceArgs(invocationArgs)) return []
    return helpDescriptions()
  }

  const command = defineCtxCommand({
    meta: { name: 'source', description: 'Manage indexed sources.' },
    subCommands: {
      add: defineCtxCommand<ReturnType<typeof sourceAddArgs>>({
        meta: { name: 'add', description: 'Add a source.' },
        args: async () => sourceAddArgs(await activeSourceDescriptions()),
        run: ({ args }) =>
          runWithExit(async () => {
            resolveSourceAdapterId(args)
            return handleSourceCommand(
              { kind: 'add', args },
              await route(),
              services,
            )
          }),
      }),
      list: defineCtxCommand({
        meta: { name: 'list', description: 'List sources.' },
        args: sourceListArgs,
        run: ({ args }) =>
          runWithExit(async () =>
            handleSourceCommand(
              { kind: 'list', args, format: resolveOutputFormat(args) },
              await route(),
              services,
            ),
          ),
      }),
      remove: defineCtxCommand({
        meta: { name: 'remove', description: 'Remove a source.' },
        args: sourceRemoveArgs,
        run: ({ args }) =>
          runWithExit(async () =>
            handleSourceCommand(
              { kind: 'remove', args },
              await route(),
              services,
            ),
          ),
      }),
    },
  })
  return { command, close: retained.close, error: retained.error }
}

export function createSourceCommand(
  invocationArgs: string[] = [],
  services: SourceCommandDeps = defaultSourceCommandDeps,
) {
  return createSourceCommandRuntime(invocationArgs, services).command
}

export const sourceCommand = createSourceCommand()
