import type { RegistryDescription } from '@ctxindex/core/registry'

export type RegistryView = 'compact' | 'detail' | 'full'

function compactRegistryDescription(description: RegistryDescription) {
  return {
    kinds: description.kinds.map(({ id, version, summary, aliases }) => ({
      id,
      version,
      ...(summary === undefined ? {} : { summary }),
      aliases,
    })),
    sources: description.sources.map(
      ({ id, version, summary, routing, capabilities }) => ({
        id,
        version,
        ...(summary === undefined ? {} : { summary }),
        routing,
        capabilities,
      }),
    ),
    actions: description.actions.map(
      ({ id, profile, effect, output, adapters }) => ({
        id,
        profile,
        effect,
        output,
        adapters,
      }),
    ),
  }
}

export function filterRegistryDescription(
  description: RegistryDescription,
  selector?: 'profile' | 'adapter' | 'action',
  id?: string,
): RegistryDescription | undefined {
  if (!selector) return description
  const key =
    selector === 'profile'
      ? 'kinds'
      : selector === 'adapter'
        ? 'sources'
        : 'actions'
  const matches = description[key].filter(
    (item) => id === undefined || item.id === id,
  )
  if (id !== undefined && matches.length === 0) return undefined
  return {
    kinds:
      selector === 'profile' ? (matches as RegistryDescription['kinds']) : [],
    sources:
      selector === 'adapter' ? (matches as RegistryDescription['sources']) : [],
    actions:
      selector === 'action' ? (matches as RegistryDescription['actions']) : [],
  }
}

export function registryJsonValue(
  description: RegistryDescription,
  selector?: 'profile' | 'adapter' | 'action',
  view: RegistryView = 'full',
): unknown {
  const value =
    view === 'compact' ? compactRegistryDescription(description) : description
  if (!selector) return value
  const selected =
    selector === 'profile'
      ? value.kinds
      : selector === 'adapter'
        ? value.sources
        : value.actions
  return view === 'detail' ? selected[0] : selected
}
