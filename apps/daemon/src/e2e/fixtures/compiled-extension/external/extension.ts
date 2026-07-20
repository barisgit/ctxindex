import type { HostApi } from './authoring-types'
import { typedHelper } from './helper'

const dependencyName = 'extension-fixture-dep'

type ExtensionResult = {
  id: string
  adapter: { id: string; hostVersion: string }
  probe: string
}

export default async function defineExtension(
  api: HostApi,
): Promise<ExtensionResult> {
  const { suffix } = (await import(dependencyName)) as { suffix: string }
  return {
    id: 'fixture.extension',
    adapter: api.defineAdapter({
      id: 'fixture.adapter',
      hostVersion: api.version,
    }),
    probe: typedHelper('typescript') + suffix,
  }
}
