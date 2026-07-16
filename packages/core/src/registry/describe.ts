import type { ProfileReference } from '@ctxindex/extension-sdk'
import { z } from 'zod'
import { compareReferences, compareStrings } from './compare'
import type { ExtensionRegistry } from './definition-registries'

export interface KindDescription {
  readonly id: string
  readonly version: number
  readonly summary?: string
  readonly aliases: readonly string[]
  readonly fields: readonly {
    readonly name: string
    readonly type: string
    readonly docs?: string
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
      ...(typeof option.description === 'string'
        ? { docs: option.description }
        : {}),
      ...('default' in option ? { default: option.default } : {}),
    }))
}

export interface SourceDescription {
  readonly id: string
  readonly version: number
  readonly summary?: string
  readonly profiles: readonly ProfileReference[]
  readonly routing: string
  readonly auth: object
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
  readonly docs?: string
  readonly default?: unknown
}

export interface ActionDescription {
  readonly id: string
  readonly profile: ProfileReference
  readonly effect: string
  readonly input: object
  readonly output: ProfileReference
  readonly docs: string
  readonly examples: readonly unknown[]
  readonly adapters: readonly ProfileReference[]
}

export interface RegistryDescription {
  readonly kinds: readonly KindDescription[]
  readonly sources: readonly SourceDescription[]
  readonly actions: readonly ActionDescription[]
}

export function describeRegistry(registry: {
  readonly profiles: Pick<ExtensionRegistry['profiles'], 'list'>
  readonly adapters: Pick<ExtensionRegistry['adapters'], 'list'>
}): RegistryDescription {
  const profiles = [...registry.profiles.list()].sort(compareReferences)
  const adapters = [...registry.adapters.list()].sort(compareReferences)

  return {
    kinds: profiles.map((profile) => ({
      id: profile.id,
      version: profile.version,
      ...(profile.docs?.summary === undefined
        ? {}
        : { summary: profile.docs.summary }),
      aliases: [...(profile.docs?.aliases ?? [])].sort(compareStrings),
      fields: Object.entries(profile.search?.fields ?? {})
        .sort(([left], [right]) => compareStrings(left, right))
        .map(([name, field]) => ({
          name,
          type: field.type,
          ...(field.docs === undefined ? {} : { docs: field.docs }),
        })),
      formats: Object.entries(profile.exports ?? {})
        .sort(([left], [right]) => compareStrings(left, right))
        .map(([name, format]) => ({
          name,
          mediaType: format.mediaType,
        })),
    })),
    sources: adapters.map((adapter) => {
      const config = z.toJSONSchema(adapter.configSchema)
      return {
        id: adapter.id,
        version: adapter.version,
        ...(adapter.docs?.summary === undefined
          ? {}
          : { summary: adapter.docs.summary }),
        profiles: [...adapter.profiles].sort(compareReferences),
        routing: adapter.routing,
        auth: adapter.auth,
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
          input: z.toJSONSchema(action.input),
          output: action.output,
          docs: action.docs,
          examples: action.examples ?? [],
          adapters: adapters
            .filter(
              (adapter) =>
                Object.hasOwn(adapter.actions, id) &&
                adapter.actions[id]?.profile.id === profile.id &&
                adapter.actions[id]?.profile.version === profile.version,
            )
            .map((adapter) => ({ id: adapter.id, version: adapter.version })),
        })),
    ),
  }
}
