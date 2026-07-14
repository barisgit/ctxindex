import type { ProfileReference } from '@ctxindex/extension-sdk'
import { z } from 'zod'
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

export interface SourceDescription {
  readonly id: string
  readonly version: number
  readonly summary?: string
  readonly profiles: readonly ProfileReference[]
  readonly capabilities: readonly string[]
  readonly config: object
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

export function describeRegistry(
  registry: ExtensionRegistry,
): RegistryDescription {
  const profiles = registry.profiles.list()
  const adapters = registry.adapters.list()

  return {
    kinds: profiles.map((profile) => ({
      id: profile.id,
      version: profile.version,
      ...(profile.docs?.summary === undefined
        ? {}
        : { summary: profile.docs.summary }),
      aliases: profile.docs?.aliases ?? [],
      fields: Object.entries(profile.search?.fields ?? {}).map(
        ([name, field]) => ({
          name,
          type: field.type,
          ...(field.docs === undefined ? {} : { docs: field.docs }),
        }),
      ),
      formats: Object.entries(profile.exports ?? {}).map(([name, format]) => ({
        name,
        mediaType: format.mediaType,
      })),
    })),
    sources: adapters.map((adapter) => ({
      id: adapter.id,
      version: adapter.version,
      ...(adapter.docs?.summary === undefined
        ? {}
        : { summary: adapter.docs.summary }),
      profiles: adapter.profiles,
      capabilities: adapter.capabilities,
      config: z.toJSONSchema(adapter.configSchema),
    })),
    actions: profiles.flatMap((profile) =>
      Object.entries(profile.actions ?? {}).map(([id, action]) => ({
        id,
        profile: { id: profile.id, version: profile.version },
        effect: action.effect,
        input: z.toJSONSchema(action.input),
        output: action.output,
        docs: action.docs,
        examples: action.examples ?? [],
        adapters: adapters
          .filter((adapter) => id in adapter.actions)
          .map((adapter) => ({ id: adapter.id, version: adapter.version })),
      })),
    ),
  }
}
