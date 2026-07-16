import { defineCommand } from 'citty'
import { accountUsage, parseAccountArgs } from '../args/account'
import { openAccountDeps } from '../deps'
import { formatAccountInventory } from '../format/account'
import { mapErrorToExit, runWithExit } from '../format/exit'

export async function handleAccountCommand(args: string[]): Promise<number> {
  const parsed = parseAccountArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${accountUsage}`)
    return 2
  }

  let deps: Awaited<ReturnType<typeof openAccountDeps>> | undefined
  try {
    deps = await openAccountDeps()
    console.log(
      formatAccountInventory(
        deps.accountService.listAccountInventory(),
        parsed.json,
      ),
    )
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  } finally {
    await deps?.close()
  }
}

export const accountCommand = defineCommand({
  meta: { name: 'account', description: 'Inspect configured Accounts.' },
  subCommands: {
    list: defineCommand({
      meta: {
        name: 'list',
        description: 'List Accounts with Grants and bound Sources.',
      },
      args: { json: { type: 'boolean', description: 'Print JSON' } },
      run: ({ rawArgs }) =>
        runWithExit(() => handleAccountCommand(['list', ...rawArgs])),
    }),
  },
})
