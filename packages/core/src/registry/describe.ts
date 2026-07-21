import { z } from 'zod'
import { compareReferences, compareStrings } from './compare'
import type { ExtensionRegistry } from './definition-registries'

interface ProfileIdentity {
  readonly id: string
  readonly version: number
}

interface AdapterIdentity {
  readonly id: string
}

export interface KindDescription extends ProfileIdentity {
  readonly fields: readonly {
    readonly name: string
    readonly type: string
  }[]
  readonly formats: readonly {
    readonly name: string
    readonly mediaType: string
  }[]
}

function configOptionType(schema: Record<string, unknown>): string {
  const primitive = new Set(['string', 'number', 'integer', 'boolean'])
  if (schema.type !== 'array') {
    return primitive.has(String(schema.type)) ? String(schema.type) : 'json'
  }
  const items = schema.items
  const itemType =
    typeof items === 'object' && items !== null && 'type' in items
      ? String(items.type)
      : 'unknown'
  return primitive.has(itemType) ? `${itemType}[]` : 'json'
}

function encodedProperty(property: string): string {
  return Array.from(new TextEncoder().encode(property), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

function describeConfigOptions(config: object): ConfigOptionDescription[] {
  const schema = config as {
    properties?: Record<string, Record<string, unknown>>
    required?: readonly string[]
  }
  const required = new Set(schema.required ?? [])
  const entries = Object.entries(schema.properties ?? {})
  const baseFlags = new Map<string, number>()
  for (const [property] of entries) {
    const base = property.replaceAll('_', '-')
    baseFlags.set(base, (baseFlags.get(base) ?? 0) + 1)
  }
  // `--config-json` is the whole-object escape hatch, so a schema property
  // named `json` must receive the same collision suffix as another property.
  baseFlags.set('json', (baseFlags.get('json') ?? 0) + 1)
  return entries
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([property, option]) => ({
      property,
      flag:
        baseFlags.get(property.replaceAll('_', '-')) === 1 &&
        !property.replaceAll('_', '-').startsWith('-')
          ? `--config-${property.replaceAll('_', '-')}`
          : `--config--${encodedProperty(property)}`,
      type: configOptionType(option),
      required: required.has(property) && !('default' in option),
      ...('default' in option ? { default: option.default } : {}),
    }))
}

export interface SourceDescription extends AdapterIdentity {
  readonly profiles: readonly ProfileIdentity[]
  readonly routing: string
  readonly provider?: {
    readonly id: string
    readonly auth: object
  }
  readonly access?: { readonly scopes: readonly string[] }
  readonly providerApiHosts: readonly string[]
  readonly capabilities: readonly string[]
  readonly config: object
  readonly configOptions: readonly ConfigOptionDescription[]
}

export interface ConfigOptionDescription {
  readonly property: string
  readonly flag: string
  readonly type: string
  readonly required: boolean
  readonly default?: unknown
}

export interface ActionDescription {
  readonly id: string
  readonly profile: ProfileIdentity
  readonly effect: string
  readonly input: object
  readonly output: ProfileIdentity
  readonly adapters: readonly AdapterIdentity[]
}

export interface RegistryDescription {
  readonly kinds: readonly KindDescription[]
  readonly sources: readonly SourceDescription[]
  readonly actions: readonly ActionDescription[]
}

function toPlainJsonSchema(schema: z.ZodType): object {
  return JSON.parse(JSON.stringify(z.toJSONSchema(schema)))
}

export function describeRegistry(registry: {
  readonly profiles: Pick<ExtensionRegistry['profiles'], 'list'>
  readonly adapters: Pick<ExtensionRegistry['adapters'], 'list'>
}): RegistryDescription {
  const profiles = [...registry.profiles.list()].sort(compareReferences)
  const adapters = [...registry.adapters.list()].sort((left, right) =>
    compareStrings(left.id, right.id),
  )

  return {
    kinds: profiles.map((profile) => ({
      id: profile.id,
      version: profile.version,
      fields: Object.entries(profile.search?.fields ?? {})
        .sort(([left], [right]) => compareStrings(left, right))
        .map(([name, field]) => ({ name, type: field.type })),
      formats: Object.entries(profile.exports ?? {})
        .sort(([left], [right]) => compareStrings(left, right))
        .map(([name, format]) => ({
          name,
          mediaType: format.mediaType,
        })),
    })),
    sources: adapters.map((adapter) => {
      const config = toPlainJsonSchema(adapter.configSchema)
      return {
        id: adapter.id,
        profiles: adapter.profiles
          .map(({ id, version }) => ({ id, version }))
          .sort(compareReferences),
        routing: adapter.routing,
        ...(adapter.provider === undefined
          ? {}
          : {
              provider: {
                id: adapter.provider.id,
                auth: adapter.provider.auth,
              },
            }),
        ...(adapter.access === undefined
          ? {}
          : { access: { scopes: [...adapter.access.scopes] } }),
        providerApiHosts: [...(adapter.providerApiHosts ?? [])].sort(
          compareStrings,
        ),
        capabilities: [...adapter.capabilities].sort(compareStrings),
        config,
        configOptions: describeConfigOptions(config),
      }
    }),
    actions: profiles.flatMap((profile) =>
      Object.entries(profile.actions ?? {})
        .sort(([left], [right]) => compareStrings(left, right))
        .map(([id, action]) => ({
          id,
          profile: { id: profile.id, version: profile.version },
          effect: action.effect,
          input: toPlainJsonSchema(action.input),
          output: action.output,
          adapters: adapters
            .filter(
              (adapter) =>
                Object.hasOwn(adapter.actions, id) &&
                adapter.actions[id]?.profile.id === profile.id &&
                adapter.actions[id]?.profile.version === profile.version,
            )
            .map((adapter) => ({ id: adapter.id })),
        })),
    ),
  }
}
