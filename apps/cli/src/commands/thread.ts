import { defineCtxCommand } from '../command-model'
import { runWithExit } from '../format/exit'
import {
  formatThreadJson,
  formatThreadText,
  handleThreadGetCommand,
} from '../thread/handle-thread-get-command'

export { formatThreadJson, formatThreadText, handleThreadGetCommand }

export const threadCommand = defineCtxCommand({
  meta: { name: 'thread', description: 'Get a local related Resource thread.' },
  args: {
    ref: { type: 'positional', required: true, description: 'Resource Ref' },
    json: { type: 'boolean', description: 'Print deterministic JSON' },
  },
  run: ({ args }) =>
    runWithExit(() =>
      handleThreadGetCommand({ ref: args.ref, json: args.json ?? false }),
    ),
})
