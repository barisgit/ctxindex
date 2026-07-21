import { handleActionCommand } from '../action/handle-action-command'
import { defineCtxCommand } from '../command-model'
import { runWithExit } from '../format/exit'

export const actionRunCommand = defineCtxCommand({
  meta: { name: 'run', description: 'Run a registry Action.' },
  args: {
    'action-id': { type: 'positional', required: true },
    source: {
      type: 'string',
      required: true,
      description: 'Exact Source label or ID',
    },
    input: {
      type: 'string',
      required: true,
      description: 'Inline JSON object or UTF-8 JSON file path',
    },
    json: { type: 'boolean', description: 'Print deterministic JSON' },
  },
  run: ({ args }) =>
    runWithExit(() =>
      handleActionCommand({
        kind: 'run',
        actionId: args['action-id'],
        sourceId: args.source,
        input: args.input,
        json: args.json ?? false,
      }),
    ),
})

export const actionCommand = defineCtxCommand({
  meta: { name: 'action', description: 'Run typed Actions.' },
  subCommands: { run: actionRunCommand },
})
