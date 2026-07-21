import { daemonRealmAdd, daemonRealmList, selectDaemon } from '../daemon/client'
import { openDeps } from '../deps'
import { mapErrorToExit } from '../format/exit'
import type { OutputFormat } from '../format/output'
import { formatRealmAdded, formatRealms } from '../format/realm'

function printOutput(output: string): void {
  if (output.length > 0) console.log(output)
}

export interface RealmCommandDeps {
  readonly selectDaemon: typeof selectDaemon
  readonly realmAdd: typeof daemonRealmAdd
  readonly realmList: typeof daemonRealmList
  readonly open: typeof openDeps
}

export type RealmCommandInput =
  | { readonly kind: 'add'; readonly slug: string; readonly name?: string }
  | { readonly kind: 'list'; readonly format: OutputFormat }

const defaultDeps: RealmCommandDeps = {
  selectDaemon,
  realmAdd: daemonRealmAdd,
  realmList: daemonRealmList,
  open: openDeps,
}

export async function handleRealmCommand(
  parsed: RealmCommandInput,
  services: RealmCommandDeps = defaultDeps,
): Promise<number> {
  let deps: Awaited<ReturnType<typeof openDeps>> | undefined
  const controller = new AbortController()
  const cancel = () => controller.abort()
  process.once('SIGINT', cancel)
  try {
    const daemon = services.selectDaemon()
    if (daemon) {
      if (parsed.kind === 'add') {
        await services.realmAdd(
          daemon,
          {
            slug: parsed.slug,
            ...(parsed.name !== undefined ? { displayName: parsed.name } : {}),
          },
          controller.signal,
        )
        console.log(formatRealmAdded(parsed.slug))
      } else {
        const result = await services.realmList(daemon, controller.signal)
        printOutput(formatRealms(result.rows, parsed.format))
      }
      return 0
    }
    deps = await services.open()
    if (parsed.kind === 'add') {
      deps.realmService.createRealm({
        slug: parsed.slug,
        ...(parsed.name !== undefined ? { displayName: parsed.name } : {}),
      })
      console.log(formatRealmAdded(parsed.slug))
      return 0
    }
    printOutput(formatRealms(deps.realmService.listRealms(), parsed.format))
    return 0
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return mapErrorToExit(err)
  } finally {
    process.removeListener('SIGINT', cancel)
    await deps?.close()
  }
}
