import { defineCtxCommand } from '../command-model'
import { runWithExit } from '../format/exit'
import { resolveOutputFormat, structuredOutputArgs } from '../format/output'
import { handleStatusCommand } from '../status/handle-status-command'

export {
  handleStatusCommand,
  type StatusCommandDeps,
  type StatusCommandInput,
} from '../status/handle-status-command'

export const statusCommand = defineCtxCommand({
  meta: { name: 'status', description: 'Show last sync status.' },
  args: {
    source: { type: 'string', description: 'Source label or ID' },
    ...structuredOutputArgs,
  },
  run: ({ args }) =>
    runWithExit(() =>
      handleStatusCommand({
        ...(args.source !== undefined ? { sourceId: args.source } : {}),
        format: resolveOutputFormat(args),
      }),
    ),
})
