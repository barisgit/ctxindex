import { defineCtxCommand } from '../command-model'
import { handleDescribeCommand } from '../describe/handle-describe-command'
import { runWithExit } from '../format/exit'

export { handleDescribeCommand }

export const describeCommand = defineCtxCommand({
  promoteInRootHelp: true,
  meta: {
    name: 'describe',
    description: 'Describe loaded Profiles, Adapters, and Actions.',
  },
  args: {
    selector: {
      type: 'positional',
      required: false,
      options: ['profile', 'adapter', 'action'],
      description: 'Definition kind: profile, adapter, or action',
    },
    id: { type: 'positional', required: false, description: 'Definition id' },
    format: {
      type: 'enum',
      options: ['text', 'markdown', 'json'],
      default: 'text',
      description: 'Output format',
    },
    json: { type: 'boolean', description: 'Print pure JSON' },
    full: { type: 'boolean', description: 'Show every matched definition' },
    source: { type: 'string', description: 'Exact Source label or ID' },
  },
  run: ({ args }) =>
    runWithExit(() =>
      handleDescribeCommand({
        ...(args.selector === undefined ? {} : { selector: args.selector }),
        ...(args.id === undefined ? {} : { id: args.id }),
        format: args.format,
        json: args.json ?? false,
        full: args.full ?? false,
        ...(args.source === undefined ? {} : { sourceId: args.source }),
      }),
    ),
})
