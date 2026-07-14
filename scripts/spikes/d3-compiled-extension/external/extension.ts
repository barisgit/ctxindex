import { suffix } from 'spike-dep'
import type { HostApi } from './authoring-types.ts'
import { typedHelper } from './helper.ts'

type ExtensionResult = {
  id: string
  adapter: { id: string; hostVersion: string }
  probe: string
}

export default function defineExtension(api: HostApi): ExtensionResult {
  return {
    id: 'spike.extension',
    adapter: api.defineAdapter({
      id: 'spike.adapter',
      hostVersion: api.version,
    }),
    probe: typedHelper('typescript') + suffix,
  }
}
