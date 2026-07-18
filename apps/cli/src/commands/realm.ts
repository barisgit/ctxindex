import { defineCommand } from 'citty'
import { parseRealmArgs, realmUsage } from '../args/realm'
import { openDeps } from '../deps'
import { mapErrorToExit, runWithExit } from '../format/exit'
import { formatRealmAdded, formatRealms } from '../format/realm'

function printOutput(output: string): void {
  if (output.length > 0) console.log(output)
}

export async function handleRealmCommand(args: string[]): Promise<number> {
  const parsed = parseRealmArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${realmUsage}`)
    return 2
  }

  try {
    const deps = await openDeps()
    if (parsed.kind === 'add') {
      deps.realmService.createRealm({
        slug: parsed.slug,
        ...(parsed.name !== undefined ? { displayName: parsed.name } : {}),
      })
      console.log(formatRealmAdded(parsed.slug))
      return 0
    }
    printOutput(
      formatRealms(deps.realmService.listRealms(), { json: parsed.json }),
    )
    return 0
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return mapErrorToExit(err)
  }
}

export const realmCommand = defineCommand({
  meta: { name: 'realm', description: 'Manage indexing realms.' },
  subCommands: {
    add: defineCommand({
      meta: { name: 'add', description: 'Add a realm.' },
      args: {
        slug: { type: 'positional', required: false },
        name: { type: 'string', description: 'Realm display name' },
      },
      run: ({ rawArgs }) =>
        runWithExit(() => handleRealmCommand(['add', ...rawArgs])),
    }),
    list: defineCommand({
      meta: { name: 'list', description: 'List existing realms.' },
      args: { json: { type: 'boolean', description: 'Print JSON' } },
      run: ({ rawArgs }) =>
        runWithExit(() => handleRealmCommand(['list', ...rawArgs])),
    }),
  },
})
