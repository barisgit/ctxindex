import {
  type ArgDef,
  type ArgsDef,
  type CommandContext,
  type CommandDef,
  defineCommand,
  type EnumArgDef,
  type ParsedArgs,
  type PositionalArgDef,
  renderUsage,
  type StringArgDef,
} from 'citty'

const commandPaths = new WeakMap<object, readonly string[]>()
const commandVersions = new WeakMap<object, string | undefined>()
const rootHelpPromotions = new WeakSet<object>()

type MultipleStringArgDef = Omit<StringArgDef, 'default'> & {
  readonly multiple: true
}
type MultipleEnumArgDef = Omit<EnumArgDef, 'default'> & {
  readonly multiple: true
}
type ConstrainedPositionalArgDef = PositionalArgDef & {
  readonly options: readonly string[]
}

export type CtxArgDef =
  | ArgDef
  | ConstrainedPositionalArgDef
  | MultipleEnumArgDef
  | MultipleStringArgDef
export type CtxArgsDef = Record<string, CtxArgDef>

export type CtxParsedArgs<TArgs extends CtxArgsDef> = Omit<
  ParsedArgs<TArgs>,
  keyof TArgs
> & {
  readonly [TName in keyof TArgs]: TArgs[TName] extends {
    readonly type: 'positional'
    readonly options: readonly (infer TOption extends string)[]
  }
    ? TArgs[TName] extends { readonly required: true }
      ? TOption
      : TOption | undefined
    : TArgs[TName] extends { readonly multiple: true }
      ? readonly string[]
      : ParsedArgs<TArgs>[TName]
}

type CtxCommandContext<TArgs extends CtxArgsDef> = Omit<
  CommandContext<TArgs>,
  'args'
> & {
  readonly args: CtxParsedArgs<TArgs>
}

export type CtxCommandDef<TArgs extends CtxArgsDef = CtxArgsDef> = Omit<
  CommandDef<TArgs>,
  'run'
> & {
  readonly promoteInRootHelp?: boolean
  readonly run?: (
    context: CtxCommandContext<TArgs>,
  ) => unknown | Promise<unknown>
}

async function resolveValue<T>(
  value: T | Promise<T> | (() => T) | (() => Promise<T>),
): Promise<T> {
  return typeof value === 'function'
    ? await (value as () => T | Promise<T>)()
    : await value
}

function aliases(definition: ArgDef): readonly string[] {
  if (!('alias' in definition)) return []
  if (definition.alias === undefined) return []
  return Array.isArray(definition.alias) ? definition.alias : [definition.alias]
}

function isValueArgument(definition: ArgDef): boolean {
  return definition.type === 'string' || definition.type === 'enum'
}

function isMultiple(definition: ArgDef): boolean {
  return 'multiple' in definition && definition.multiple === true
}

function positionalOptions(definition: ArgDef): readonly string[] | undefined {
  if (definition.type !== 'positional' || !('options' in definition)) {
    return undefined
  }
  return Array.isArray(definition.options) ? definition.options : undefined
}

function normalizeDefinitions<TArgs extends CtxArgsDef>(
  definitions: TArgs,
): TArgs {
  return Object.fromEntries(
    Object.entries(definitions).map(([name, definition]) => {
      const options = positionalOptions(definition)
      if (options === undefined || definition.valueHint !== undefined) {
        return [name, definition]
      }
      return [name, { ...definition, valueHint: options.join('|') }]
    }),
  ) as TArgs
}

interface ResolvedOption {
  readonly name: string
  readonly definition: ArgDef
}

function optionMap(definitions: ArgsDef): Map<string, ResolvedOption> {
  const options = new Map<string, ResolvedOption>()
  for (const [name, definition] of Object.entries(definitions)) {
    if (definition.type === 'positional') continue
    const resolved = { name, definition }
    options.set(name, resolved)
    for (const alias of aliases(definition)) options.set(alias, resolved)
    if (
      definition.type === 'boolean' &&
      (definition.default === true ||
        definition.negativeDescription !== undefined)
    ) {
      options.set(`no-${name}`, resolved)
    }
  }
  return options
}

function resolveOption(
  options: ReadonlyMap<string, ResolvedOption>,
  token: string,
): ResolvedOption | undefined {
  if (token.startsWith('--')) return options.get(token.slice(2))
  if (token.startsWith('-') && token.length === 2) {
    return options.get(token.slice(1))
  }
  return undefined
}

function validateTokens(
  rawArgs: readonly string[],
  definitions: ArgsDef,
): string | undefined {
  const options = optionMap(definitions)
  const positionals = Object.entries(definitions).filter(
    ([, definition]) => definition.type === 'positional',
  )

  const seen = new Set<string>()
  const suppliedPositionals: string[] = []
  let afterDelimiter = false
  for (let index = 0; index < rawArgs.length; index += 1) {
    const token = rawArgs[index]
    if (token === undefined) continue
    if (afterDelimiter) {
      suppliedPositionals.push(token)
      continue
    }
    if (token === '--') {
      afterDelimiter = true
      continue
    }
    if (!token.startsWith('-') || token === '-') {
      suppliedPositionals.push(token)
      continue
    }

    const equalsIndex = token.indexOf('=')
    const optionToken = equalsIndex === -1 ? token : token.slice(0, equalsIndex)
    const option = resolveOption(options, optionToken)
    if (option === undefined) return `unknown option ${optionToken}`
    if (seen.has(option.name) && !isMultiple(option.definition)) {
      return `duplicate option --${option.name}`
    }
    seen.add(option.name)

    if (option.definition.type === 'boolean') {
      if (equalsIndex !== -1) {
        return `boolean option ${optionToken} does not accept a value`
      }
      continue
    }
    if (!isValueArgument(option.definition)) continue

    const value =
      equalsIndex === -1 ? rawArgs[index + 1] : token.slice(equalsIndex + 1)
    if (
      value === undefined ||
      value.length === 0 ||
      (equalsIndex === -1 && resolveOption(options, value) !== undefined)
    ) {
      return `option ${optionToken} requires a non-empty value`
    }
    if (equalsIndex === -1) index += 1
  }

  if (suppliedPositionals.length > positionals.length) {
    return `unexpected argument ${suppliedPositionals[positionals.length]}`
  }
  for (const [index, value] of suppliedPositionals.entries()) {
    const positional = positionals[index]
    if (positional === undefined) continue
    const [name, definition] = positional
    const options = positionalOptions(definition)
    if (options !== undefined && !options.includes(value)) {
      return `invalid value for argument ${name}: expected one of ${options.join(', ')}`
    }
  }
  return undefined
}

function collectMultipleValues(
  rawArgs: readonly string[],
  definitions: ArgsDef,
): ReadonlyMap<string, readonly string[]> {
  const options = new Map<string, ResolvedOption>()
  const collected = new Map<string, string[]>()
  for (const [name, definition] of Object.entries(definitions)) {
    if (definition.type === 'positional') continue
    const resolved = { name, definition }
    options.set(name, resolved)
    for (const alias of aliases(definition)) options.set(alias, resolved)
    if (isMultiple(definition)) collected.set(name, [])
  }

  for (let index = 0; index < rawArgs.length; index += 1) {
    const token = rawArgs[index]
    if (token === undefined || token === '--') break
    if (!token.startsWith('-') || token === '-') continue
    const equalsIndex = token.indexOf('=')
    const optionToken = equalsIndex === -1 ? token : token.slice(0, equalsIndex)
    const option = resolveOption(options, optionToken)
    if (option === undefined || !isValueArgument(option.definition)) continue
    const value =
      equalsIndex === -1 ? rawArgs[index + 1] : token.slice(equalsIndex + 1)
    if (equalsIndex === -1) index += 1
    if (value !== undefined && isMultiple(option.definition)) {
      collected.get(option.name)?.push(value)
    }
  }
  return collected
}

function commandPath(command: object): readonly string[] {
  return commandPaths.get(command) ?? ['ctxindex']
}

export function defineCtxCommand<const TArgs extends CtxArgsDef = CtxArgsDef>(
  definition: CtxCommandDef<TArgs>,
): CommandDef<TArgs> {
  const {
    promoteInRootHelp = false,
    run: originalRun,
    args: originalArgs,
    ...commandDefinition
  } = definition
  let command: CommandDef<TArgs>
  command = defineCommand({
    ...commandDefinition,
    ...(originalArgs === undefined
      ? {}
      : {
          args: async () =>
            normalizeDefinitions(await resolveValue(originalArgs)),
        }),
    ...(originalRun === undefined
      ? {}
      : {
          run: async (context) => {
            const resolvedDefinitions = await resolveValue(
              command.args ?? ({} as TArgs),
            )
            const error = validateTokens(context.rawArgs, resolvedDefinitions)
            if (error !== undefined) {
              console.error(`${commandPath(command).join(' ')}: ${error}`)
              process.exitCode = 2
              return
            }
            const parsed = context.args as Record<string, unknown>
            for (const [name, values] of collectMultipleValues(
              context.rawArgs,
              resolvedDefinitions,
            )) {
              parsed[name] = values
              for (const alias of aliases(
                resolvedDefinitions[name] as ArgDef,
              )) {
                parsed[alias] = values
              }
            }
            return originalRun({
              ...context,
              args: context.args as CtxParsedArgs<TArgs>,
            })
          },
        }),
  })
  if (promoteInRootHelp) rootHelpPromotions.add(command)
  return command
}

export async function prepareCommandTree<TArgs extends ArgsDef>(
  root: CommandDef<TArgs>,
): Promise<void> {
  const rootMeta = await resolveValue(root.meta ?? {})
  const rootName = rootMeta.name ?? 'ctxindex'
  const rootVersion = rootMeta.version

  async function visit<TCommandArgs extends ArgsDef>(
    command: CommandDef<TCommandArgs>,
    path: readonly string[],
  ): Promise<void> {
    commandPaths.set(command, path)
    commandVersions.set(command, rootVersion)
    if (command.subCommands === undefined) return
    const children = await resolveValue(command.subCommands)
    for (const [name, childValue] of Object.entries(children)) {
      const child = await resolveValue(childValue)
      await visit(child, [...path, name])
    }
  }

  await visit(root, [rootName])
}

async function interfaceGuide<TArgs extends ArgsDef>(
  command: CommandDef<TArgs>,
): Promise<string> {
  if (commandPath(command).length !== 1) return ''
  const children =
    command.subCommands === undefined
      ? {}
      : await resolveValue(command.subCommands)
  const resolvedChildren = await Promise.all(
    Object.values(children).map((child) => resolveValue(child)),
  )
  const promoted = resolvedChildren.filter((child) =>
    rootHelpPromotions.has(child),
  )
  if (promoted.length === 0) return ''
  const rows = await Promise.all(
    promoted.map(async (child) => {
      const meta = await resolveValue(child.meta ?? {})
      return `  ${commandPath(child).join(' ')} --help  ${meta.description ?? ''}`.trimEnd()
    }),
  )
  return ['INTERFACE', '', ...rows].join('\n')
}

export async function renderCommandUsage<TArgs extends ArgsDef>(
  command: CommandDef<TArgs>,
): Promise<string> {
  const path = commandPath(command)
  const version = commandVersions.get(command)
  const parent =
    path.length === 1
      ? undefined
      : defineCommand<TArgs>({
          meta: {
            name: path.slice(0, -1).join(' '),
            ...(version === undefined ? {} : { version }),
          },
        })
  const usage = await renderUsage(command, parent)
  const guide = await interfaceGuide(command)
  return guide.length === 0 ? usage : `${usage}\n\n${guide}`
}

export interface CommandReferenceArgument {
  readonly name: string
  readonly type: ArgDef['type']
  readonly required: boolean
  readonly multiple: boolean
  readonly description?: string
  readonly aliases?: readonly string[]
  readonly choices?: readonly string[]
  readonly defaultValue?: boolean | number | string
}

export interface CommandReferenceEntry {
  readonly path: readonly string[]
  readonly description?: string
  readonly usage: string
  readonly arguments: readonly CommandReferenceArgument[]
  readonly subCommands: readonly string[]
}

export interface CommandReferenceProjection {
  readonly commands: readonly CommandReferenceEntry[]
}

function projectArgument(
  name: string,
  definition: ArgDef,
): CommandReferenceArgument {
  return {
    name,
    type: definition.type,
    required: definition.required === true,
    multiple: isMultiple(definition),
    ...(definition.description === undefined
      ? {}
      : { description: definition.description }),
    ...(aliases(definition).length === 0
      ? {}
      : { aliases: aliases(definition) }),
    ...(!('options' in definition) || definition.options === undefined
      ? {}
      : { choices: definition.options }),
    ...(definition.default === undefined
      ? {}
      : { defaultValue: definition.default }),
  }
}

export async function projectCommandReference<TArgs extends ArgsDef>(
  root: CommandDef<TArgs>,
): Promise<CommandReferenceProjection> {
  await prepareCommandTree(root)
  const commands: CommandReferenceEntry[] = []

  async function visit<TCommandArgs extends ArgsDef>(
    command: CommandDef<TCommandArgs>,
  ): Promise<void> {
    const meta = await resolveValue(command.meta ?? {})
    const definitions = await resolveValue(command.args ?? ({} as TCommandArgs))
    const children =
      command.subCommands === undefined
        ? {}
        : await resolveValue(command.subCommands)
    commands.push({
      path: commandPath(command),
      ...(meta.description === undefined
        ? {}
        : { description: meta.description }),
      usage: await renderCommandUsage(command),
      arguments: Object.entries(definitions).map(([name, definition]) =>
        projectArgument(name, definition),
      ),
      subCommands: Object.keys(children),
    })
    for (const childValue of Object.values(children)) {
      await visit(await resolveValue(childValue))
    }
  }

  await visit(root)
  return { commands }
}

const BUILTIN_FLAGS = new Set(['--help', '-h', '--version', '-v'])

async function findSubCommand(
  command: CommandDef<ArgsDef>,
  name: string,
): Promise<CommandDef<ArgsDef> | undefined> {
  if (command.subCommands === undefined) return undefined
  const children = await resolveValue(command.subCommands)
  if (children[name] !== undefined) return resolveValue(children[name])
  for (const childValue of Object.values(children)) {
    const child = await resolveValue(childValue)
    const meta = await resolveValue(child.meta ?? {})
    const commandAliases = Array.isArray(meta.alias)
      ? meta.alias
      : meta.alias === undefined
        ? []
        : [meta.alias]
    if (commandAliases.includes(name)) return child
  }
  return undefined
}

export async function normalizeBuiltinFlagValues<TArgs extends ArgsDef>(
  root: CommandDef<TArgs>,
  rawArgs: readonly string[],
): Promise<string[]> {
  let command = root as unknown as CommandDef<ArgsDef>
  let definitions = await resolveValue(command.args ?? {})
  let options = optionMap(definitions)
  const normalized: string[] = []

  for (let index = 0; index < rawArgs.length; index += 1) {
    const token = rawArgs[index]
    if (token === undefined) continue
    const option = resolveOption(options, token)
    const next = rawArgs[index + 1]
    if (
      option !== undefined &&
      isValueArgument(option.definition) &&
      next !== undefined &&
      BUILTIN_FLAGS.has(next)
    ) {
      normalized.push(`${token}=${next}`)
      index += 1
      continue
    }
    normalized.push(token)
    if (token.startsWith('-')) {
      if (
        option !== undefined &&
        isValueArgument(option.definition) &&
        !token.includes('=')
      ) {
        const value = rawArgs[index + 1]
        if (value !== undefined) {
          normalized.push(value)
          index += 1
        }
      }
      continue
    }
    const child = await findSubCommand(command, token)
    if (child !== undefined) {
      command = child
      definitions = await resolveValue(command.args ?? {})
      options = optionMap(definitions)
    }
  }
  return normalized
}

function subCommandIndex(
  rawArgs: readonly string[],
  definitions: ArgsDef,
): number | undefined {
  const options = optionMap(definitions)
  for (let index = 0; index < rawArgs.length; index += 1) {
    const token = rawArgs[index]
    if (token === undefined || token === '--') return undefined
    if (!token.startsWith('-') || token === '-') return index
    const equalsIndex = token.indexOf('=')
    const option = resolveOption(
      options,
      equalsIndex === -1 ? token : token.slice(0, equalsIndex),
    )
    if (
      equalsIndex === -1 &&
      option !== undefined &&
      isValueArgument(option.definition)
    ) {
      index += 1
    }
  }
  return undefined
}

export async function validateCommandInvocation<TArgs extends ArgsDef>(
  root: CommandDef<TArgs>,
  rawArgs: readonly string[],
): Promise<string | undefined> {
  if (
    rawArgs.length === 1 &&
    (rawArgs[0] === '--version' || rawArgs[0] === '-v')
  ) {
    return undefined
  }
  const withoutHelp = (tokens: readonly string[]) =>
    tokens.filter((token) => token !== '--help' && token !== '-h')
  let command = root as unknown as CommandDef<ArgsDef>
  let remaining = [...rawArgs]
  while (true) {
    const definitions = await resolveValue(command.args ?? {})
    const hasSubCommands = command.subCommands !== undefined
    if (!hasSubCommands) {
      const error = validateTokens(withoutHelp(remaining), definitions)
      return error === undefined
        ? undefined
        : `${commandPath(command).join(' ')}: ${error}`
    }

    const index = subCommandIndex(remaining, definitions)
    const segment = index === undefined ? remaining : remaining.slice(0, index)
    const error = validateTokens(withoutHelp(segment), definitions)
    if (error !== undefined) {
      return `${commandPath(command).join(' ')}: ${error}`
    }
    if (index === undefined) return undefined
    const name = remaining[index]
    if (name === undefined) return undefined
    const child = await findSubCommand(command, name)
    if (child === undefined) {
      return `${commandPath(command).join(' ')}: unknown command ${name}`
    }
    command = child
    remaining = remaining.slice(index + 1)
  }
}
