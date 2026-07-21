import { handleActionCommand } from '../action/handle-action-command'
import { loadCliDefinitions, printExtensionDiagnostics } from '../definitions'
import { mapErrorToExit } from '../format/exit'
import {
  filterRegistryDescription,
  formatRegistryMarkdown,
  formatRegistryText,
  registryJsonValue,
} from '../format/registry'

type DescribeSelector = 'profile' | 'adapter' | 'action'
type DescribeFormat = 'text' | 'markdown' | 'json'

export interface DescribeCommandInput {
  readonly selector?: DescribeSelector
  readonly id?: string
  readonly format: DescribeFormat
  readonly json: boolean
  readonly full: boolean
  readonly sourceId?: string
}

export async function handleDescribeCommand(
  input: DescribeCommandInput,
  describeAction: typeof handleActionCommand = handleActionCommand,
): Promise<number> {
  const selector = input.selector
  if (input.id !== undefined && input.full) {
    console.error('describe: --full is redundant with an exact id')
    return 2
  }
  if (
    input.sourceId !== undefined &&
    (selector !== 'action' || input.id === undefined)
  ) {
    console.error('describe: --source requires an exact Action id')
    return 2
  }
  if (input.json && input.format !== 'text' && input.format !== 'json') {
    console.error('describe: --json conflicts with --format')
    return 2
  }
  const format = input.json ? 'json' : input.format
  if (
    selector === 'action' &&
    input.id !== undefined &&
    input.sourceId !== undefined
  ) {
    if (format === 'markdown') {
      console.error('describe action: --format markdown is not supported')
      return 2
    }
    return describeAction({
      kind: 'describe',
      actionId: input.id,
      sourceId: input.sourceId,
      json: format === 'json',
    })
  }

  try {
    const loaded = await loadCliDefinitions()
    printExtensionDiagnostics(loaded.diagnostics)
    const selected = filterRegistryDescription(
      loaded.description,
      selector,
      input.id,
    )
    if (!selected) {
      console.error(`describe: unknown ${input.selector} id "${input.id}"`)
      return 2
    }
    const view = input.id ? 'detail' : input.full ? 'full' : 'compact'
    if (format === 'json')
      console.log(
        JSON.stringify(registryJsonValue(selected, selector, view), null, 2),
      )
    else if (format === 'markdown')
      console.log(formatRegistryMarkdown(selected, view))
    else console.log(formatRegistryText(selected, view))
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  }
}
