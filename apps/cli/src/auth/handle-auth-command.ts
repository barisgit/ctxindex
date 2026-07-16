import { authorizeProvider, resolveOAuthSelection } from '@ctxindex/core/auth'
import { type AuthArgs, authUsage, parseAuthArgs } from '../args/auth'
import { loadAuthDefinitionDeps, openDeps } from '../deps'
import { formatGrantAdded } from '../format/auth'
import { mapErrorToExit } from '../format/exit'

type AddArgs = Extract<AuthArgs, { kind: 'add' }>
async function handleAdd(input: AddArgs): Promise<number> {
  const definitions = await loadAuthDefinitionDeps()
  resolveOAuthSelection(
    definitions.registry.adapters,
    input.provider,
    input.adapterIds,
  )
  const deps = await openDeps(definitions)
  try {
    const result = await authorizeProvider(
      {
        provider: input.provider,
        adapterIds: input.adapterIds,
        mode: input.mode,
        ...(input.clientId ? { clientId: input.clientId } : {}),
        ...(input.label !== undefined ? { label: input.label } : {}),
      },
      {
        registry: deps.registry.adapters,
        authService: deps.authService,
        emitAuthorizationUrl: (url) => console.log(`Open this URL: ${url}`),
      },
    )
    console.log(formatGrantAdded(result))
    return 0
  } finally {
    await deps.close()
  }
}
export async function handleAuthCommand(args: string[]): Promise<number> {
  const parsed = parseAuthArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${authUsage}`)
    return 2
  }
  try {
    return await handleAdd(parsed)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  }
}
