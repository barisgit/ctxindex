import { defineCommand } from 'citty'
import { parseDescribeArgs } from '../args/describe'
import { loadCliDefinitions, printExtensionDiagnostics } from '../definitions'
import { mapErrorToExit, runWithExit } from '../format/exit'
import {
  filterRegistryDescription,
  formatRegistryMarkdown,
  formatRegistryText,
  registryJsonValue,
} from '../format/registry'

export async function handleDescribeCommand(args: string[]): Promise<number> {
  const parsed = parseDescribeArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(parsed.message)
    return 2
  }
  try {
    const loaded = await loadCliDefinitions()
    printExtensionDiagnostics(loaded.diagnostics)
    const selected = filterRegistryDescription(
      loaded.description,
      parsed.selector,
      parsed.id,
    )
    if (!selected) {
      console.error(`describe: unknown ${parsed.selector} id "${parsed.id}"`)
      return 2
    }
    const view = parsed.id ? 'detail' : parsed.full ? 'full' : 'compact'
    if (parsed.format === 'json')
      console.log(
        JSON.stringify(
          registryJsonValue(selected, parsed.selector, view),
          null,
          2,
        ),
      )
    else if (parsed.format === 'markdown')
      console.log(formatRegistryMarkdown(selected, view))
    else console.log(formatRegistryText(selected, view))
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  }
}

export const describeCommand = defineCommand({
  meta: {
    name: 'describe',
    description: 'Describe loaded Profiles, Adapters, and Actions.',
  },
  args: {
    selector: { type: 'positional', required: false },
    id: { type: 'positional', required: false },
    format: { type: 'string', description: 'text, markdown, or json' },
    json: { type: 'boolean', description: 'Print pure JSON' },
    full: { type: 'boolean', description: 'Show every matched definition' },
  },
  run: ({ rawArgs }) => runWithExit(() => handleDescribeCommand(rawArgs)),
})
