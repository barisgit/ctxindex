import { compareStrings, type SourceDescription } from '@ctxindex/core/registry'
import type { CtxParsedArgs } from '../command-model'
import { structuredOutputArgs } from '../format/output'

export type SourceArgumentDescription = Pick<SourceDescription, 'id'> & {
  readonly configOptions: readonly {
    readonly property: string
    readonly flag: string
    readonly type: string
    readonly required: boolean
    readonly docs?: string | undefined
    readonly default?: unknown
  }[]
}

export function needsDynamicSourceArgs(
  invocationArgs: readonly string[],
): boolean {
  if (invocationArgs.includes('--help') || invocationArgs.includes('-h')) {
    return true
  }
  return invocationArgs.some((token) => {
    const name = token.split('=', 1)[0]
    return name?.startsWith('--config-') === true && name !== '--config-json'
  })
}

const adapterSelectorDescription =
  'Adapter ID (provide the positional ID or --adapter)'

export const sourceAddBaseArgs = {
  adapter: { type: 'string', description: adapterSelectorDescription },
  label: { type: 'string', description: 'Global Source label' },
  account: {
    type: 'string',
    description: 'Account label or Account ID',
  },
  'config-json': { type: 'string', description: 'Adapter config JSON' },
  'search-routing': {
    type: 'enum',
    options: ['indexed', 'federated', 'hybrid'] as [
      'indexed',
      'federated',
      'hybrid',
    ],
    description: 'Source search routing override',
  },
  'no-sync': {
    type: 'boolean',
    description: 'Disable synchronization for this Source',
  },
  'adapter-id': {
    type: 'positional',
    required: false,
    description: adapterSelectorDescription,
  },
  realm: { type: 'string', alias: 'r', description: 'Realm slug' },
} as const

export const sourceListArgs = {
  realm: { type: 'string', alias: 'r', description: 'Realm slug' },
  ...structuredOutputArgs,
} as const

export const sourceRemoveArgs = {
  source: {
    type: 'positional',
    required: true,
    description: 'Exact Source label or ID',
  },
} as const

type GeneratedSourceConfigArg = {
  readonly type: 'string'
  readonly description: string
  readonly multiple?: true
}

export function generatedSourceConfigArgs(
  sources: readonly SourceArgumentDescription[],
): Record<string, GeneratedSourceConfigArg> {
  const byFlag = new Map<
    string,
    { descriptions: string[]; multiple: boolean }
  >()
  for (const source of [...sources].sort((left, right) =>
    compareStrings(left.id, right.id),
  )) {
    for (const option of source.configOptions) {
      const description = `${source.id}: ${option.property} (${option.type}${option.required ? ', required' : ''}${option.default !== undefined ? `, default ${JSON.stringify(option.default)}` : ''})`
      const flag = option.flag.slice(2)
      const existing = byFlag.get(flag)
      byFlag.set(flag, {
        descriptions: [...(existing?.descriptions ?? []), description],
        multiple: (existing?.multiple ?? false) || option.type.endsWith('[]'),
      })
    }
  }
  return Object.fromEntries(
    [...byFlag.entries()]
      .sort(([left], [right]) => compareStrings(left, right))
      .map(([flag, value]) => [
        flag,
        {
          type: 'string' as const,
          description: value.descriptions.join('; '),
          ...(value.multiple ? { multiple: true as const } : {}),
        },
      ]),
  )
}

export function sourceAddArgs(sources: readonly SourceArgumentDescription[]) {
  return {
    ...sourceAddBaseArgs,
    ...generatedSourceConfigArgs(sources),
  }
}

export type SourceAddCommandArgs = CtxParsedArgs<
  ReturnType<typeof sourceAddArgs>
>
export type SourceListCommandArgs = CtxParsedArgs<typeof sourceListArgs>
export type SourceRemoveCommandArgs = CtxParsedArgs<typeof sourceRemoveArgs>

export interface ResolvedSourceAddArgs {
  readonly adapterId: string
  readonly realmSlug?: string
  readonly label?: string
  readonly configJson?: string
  readonly account?: string
  readonly searchRouting?: 'indexed' | 'federated' | 'hybrid'
  readonly syncEnabled?: boolean
}

function invalid(message: string): never {
  throw Object.assign(new Error(message), { code: 'invalid_args' })
}

export function resolveSourceAdapterId(args: SourceAddCommandArgs): string {
  if (args.adapter !== undefined && args['adapter-id'] !== undefined) {
    invalid('source add: cannot use both positional <adapter-id> and --adapter')
  }
  const adapterId = args.adapter ?? args['adapter-id']
  if (!adapterId) invalid('source add: missing <adapter-id>')
  return adapterId
}

function parsePrimitive(value: string, type: string): unknown {
  if (type === 'json') {
    try {
      return JSON.parse(value)
    } catch {
      invalid('source add: invalid JSON')
    }
  }
  if (type === 'string') return value
  if (type === 'boolean') {
    if (value === 'true') return true
    if (value === 'false') return false
    invalid('source add: invalid boolean')
  }
  if (type === 'integer') {
    if (!/^-?(0|[1-9]\d*)$/.test(value)) invalid('source add: invalid integer')
    const parsed = Number(value)
    if (!Number.isSafeInteger(parsed)) invalid('source add: invalid integer')
    return parsed
  }
  if (type === 'number') {
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) {
      invalid('source add: invalid number')
    }
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) invalid('source add: invalid number')
    return parsed
  }
  invalid(`source add: unsupported type ${type}`)
}

function suppliedConfigValues(
  args: SourceAddCommandArgs,
): ReadonlyMap<string, string | readonly string[]> {
  const supplied = new Map<string, string | readonly string[]>()
  for (const [name, value] of Object.entries(args)) {
    if (name === 'config-json' || !name.startsWith('config-')) continue
    if (typeof value === 'string') supplied.set(name, value)
    else if (Array.isArray(value) && value.length > 0) {
      supplied.set(name, value as readonly string[])
    }
  }
  return supplied
}

export function resolveSourceAddArgs(
  args: SourceAddCommandArgs,
  sources: readonly SourceArgumentDescription[],
): ResolvedSourceAddArgs {
  const adapterId = resolveSourceAdapterId(args)
  const source = sources.find((candidate) => candidate.id === adapterId)
  if (!source) invalid(`source add: unknown adapter id "${adapterId}"`)

  const supplied = suppliedConfigValues(args)
  if (args['config-json'] !== undefined && supplied.size > 0) {
    invalid(
      'source add: cannot combine --config-json with generated config options',
    )
  }

  let configJson = args['config-json']
  if (supplied.size > 0) {
    const options = new Map(
      source.configOptions.map((option) => [option.flag.slice(2), option]),
    )
    const config: Record<string, unknown> = {}
    for (const [flag, raw] of supplied) {
      const option = options.get(flag)
      if (!option) invalid(`source add: unknown option --${flag}`)
      const isArray = option.type.endsWith('[]')
      const type = isArray ? option.type.slice(0, -2) : option.type
      const values = Array.isArray(raw) ? raw : [raw]
      if (!isArray && values.length > 1) {
        invalid(`source add: --${flag} cannot be repeated`)
      }
      try {
        const parsed = values.map((value) => parsePrimitive(value, type))
        config[option.property] = isArray ? parsed : parsed.at(-1)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        invalid(`${message} for --${flag}`)
      }
    }
    configJson = JSON.stringify(config)
  }

  return {
    adapterId,
    ...(args.realm === undefined ? {} : { realmSlug: args.realm }),
    ...(args.label === undefined ? {} : { label: args.label }),
    ...(configJson === undefined ? {} : { configJson }),
    ...(args.account === undefined ? {} : { account: args.account }),
    ...(args['search-routing'] === undefined
      ? {}
      : { searchRouting: args['search-routing'] }),
    ...(args.sync === false ? { syncEnabled: false } : {}),
  }
}
