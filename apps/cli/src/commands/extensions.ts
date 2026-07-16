import { defineCommand } from 'citty'
import { parseExtensionsArgs } from '../args/extensions'
import { loadCliDefinitions, printExtensionDiagnostics } from '../definitions'
import { mapErrorToExit, runWithExit } from '../format/exit'
import { formatExtensions } from '../format/registry'

export async function handleExtensionsCommand(args: string[]): Promise<number> {
  const parsed = parseExtensionsArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(parsed.message)
    return 2
  }
  try {
    const loaded = await loadCliDefinitions()
    printExtensionDiagnostics(loaded.diagnostics)
    console.log(formatExtensions(loaded.registry, parsed.json))
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  }
}

export const extensionsCommand = defineCommand({
  meta: { name: 'extensions', description: 'Inspect loaded Extensions.' },
  subCommands: {
    list: defineCommand({
      meta: { name: 'list', description: 'List loaded Extensions.' },
      args: { json: { type: 'boolean', description: 'Print JSON' } },
      run: ({ rawArgs }) =>
        runWithExit(() => handleExtensionsCommand(['list', ...rawArgs])),
    }),
  },
})
