import { defineCommand } from 'citty'
import { runWithExit } from '../format/exit'
import {
  formatThreadJson,
  formatThreadText,
  handleThreadGetCommand,
} from '../thread/handle-thread-get-command'

export { formatThreadJson, formatThreadText, handleThreadGetCommand }

export const threadGetCommand = defineCommand({
  meta: { name: 'get', description: 'Get a local related Resource thread.' },
  args: {
    ref: { type: 'positional', required: false, description: 'Resource Ref' },
    json: { type: 'boolean', description: 'Print deterministic JSON' },
  },
  run: ({ rawArgs }) => runWithExit(() => handleThreadGetCommand(rawArgs)),
})

export const threadCommand = defineCommand({
  meta: { name: 'thread', description: 'Traverse local Resource Relations.' },
  subCommands: { get: threadGetCommand },
})
