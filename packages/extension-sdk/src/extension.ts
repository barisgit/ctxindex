import type { AnyAdapterDefinition, defineAdapter } from './adapter'
import type { AnyProfileDefinition, defineProfile } from './profile'

export interface ExtensionDefinition<
  TId extends string = string,
  TVersion extends number = number,
  TProfiles extends
    readonly AnyProfileDefinition[] = readonly AnyProfileDefinition[],
  TAdapters extends
    readonly AnyAdapterDefinition[] = readonly AnyAdapterDefinition[],
> {
  readonly id: TId
  readonly version: TVersion
  readonly profiles: TProfiles
  readonly adapters: TAdapters
  readonly docs?: { readonly summary: string }
}

export type AnyExtensionDefinition = ExtensionDefinition

export interface ExtensionAuthoringHost {
  readonly z: typeof import('zod').z
  readonly defineProfile: typeof defineProfile
  readonly defineAdapter: typeof defineAdapter
  readonly defineExtension: typeof defineExtension
}

export function defineExtension<
  const TId extends string,
  const TVersion extends number,
  const TProfiles extends readonly AnyProfileDefinition[],
  const TAdapters extends readonly AnyAdapterDefinition[],
>(
  definition: ExtensionDefinition<TId, TVersion, TProfiles, TAdapters>,
): ExtensionDefinition<TId, TVersion, TProfiles, TAdapters> {
  return definition
}
