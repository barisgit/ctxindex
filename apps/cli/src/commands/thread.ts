import { defineCtxCommand } from '../command-model'
import { runWithExit } from '../format/exit'
import { resolveOutputFormat, structuredOutputArgs } from '../format/output'
import {
  formatThreadJson,
  formatThreadPretty,
  formatThreadText,
} from '../format/thread'
import { handleThreadGetCommand } from '../thread/handle-thread-get-command'

export {
  formatThreadJson,
  formatThreadPretty,
  formatThreadText,
  handleThreadGetCommand,
}

export const threadCommand = defineCtxCommand({
  meta: { name: 'thread', description: 'Get a local related Resource thread.' },
  args: {
    ref: { type: 'positional', required: true, description: 'Resource Ref' },
    ...structuredOutputArgs,
  },
  run: ({ args }) =>
    runWithExit(() =>
      handleThreadGetCommand({
        ref: args.ref,
        format: resolveOutputFormat(args),
      }),
    ),
})
