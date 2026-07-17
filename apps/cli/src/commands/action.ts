import { defineCommand } from 'citty'
import { handleActionCommand } from '../action/handle-action-command'
import { runWithExit } from '../format/exit'

export const actionDescribeCommand = defineCommand({
  meta: { name: 'describe', description: 'Describe a registry Action.' },
  args: {
    'action-id': { type: 'positional', required: false },
    source: { type: 'string', description: 'Exact Source label or ID' },
    json: { type: 'boolean', description: 'Print deterministic JSON' },
  },
  run: ({ rawArgs }) =>
    runWithExit(() => handleActionCommand(['describe', ...rawArgs])),
})

export const actionRunCommand = defineCommand({
  meta: { name: 'run', description: 'Run a registry Action.' },
  args: {
    'action-id': { type: 'positional', required: false },
    source: { type: 'string', description: 'Exact Source label or ID' },
    input: {
      type: 'string',
      description: 'Inline JSON object or UTF-8 JSON file path',
    },
    json: { type: 'boolean', description: 'Print deterministic JSON' },
    'confirm-irreversible': {
      type: 'boolean',
      description: 'Confirm an irreversible Action',
    },
  },
  run: ({ rawArgs }) =>
    runWithExit(() => handleActionCommand(['run', ...rawArgs])),
})

export const actionCommand = defineCommand({
  meta: { name: 'action', description: 'Describe or run typed Actions.' },
  subCommands: {
    describe: actionDescribeCommand,
    run: actionRunCommand,
  },
})
