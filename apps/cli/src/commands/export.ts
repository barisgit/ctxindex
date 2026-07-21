import { defineCtxCommand } from '../command-model'
import { handleExportCommand } from '../export/handle-export-command'
import { runWithExit } from '../format/exit'

export {
  type ExportCommandDeps,
  type ExportCommandInput,
  handleExportCommand,
} from '../export/handle-export-command'

export const exportCommand = defineCtxCommand({
  meta: {
    name: 'export',
    description: 'Export a Resource in a Profile format.',
  },
  args: {
    ref: { type: 'positional', required: true, description: 'Resource Ref' },
    format: {
      type: 'string',
      required: true,
      alias: 'f',
      description: 'Export format',
    },
  },
  run: ({ args }) =>
    runWithExit(() =>
      handleExportCommand({ ref: args.ref, format: args.format }),
    ),
})
