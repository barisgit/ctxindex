import { hasHelpFlag, parseFlags } from './flags'

export interface ExtensionSelector {
  readonly id: string
  readonly version: number
}

export type ExtensionsArgs =
  | { readonly kind: 'list'; readonly json: boolean }
  | {
      readonly kind: 'catalog-add'
      readonly name: string
      readonly repository: string
      readonly ref: string
      readonly trust: true
      readonly json: boolean
    }
  | { readonly kind: 'catalog-list'; readonly json: boolean }
  | {
      readonly kind: 'catalog-show'
      readonly name: string
      readonly extension?: ExtensionSelector
      readonly json: boolean
    }
  | {
      readonly kind: 'catalog-refresh'
      readonly name: string
      readonly json: boolean
    }
  | {
      readonly kind: 'catalog-remove'
      readonly name: string
      readonly json: boolean
    }
  | {
      readonly kind: 'install'
      readonly catalog: string
      readonly extension: ExtensionSelector
      readonly trust: true
      readonly json: boolean
    }
  | {
      readonly kind: 'uninstall'
      readonly extension: ExtensionSelector
      readonly json: boolean
    }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

function unknown(message: string): ExtensionsArgs {
  return { kind: 'unknown', message }
}

function parseSelector(value: string): ExtensionSelector | undefined {
  const match = /^(.+)@([1-9]\d*)$/.exec(value)
  if (match === null || match[1] === undefined || match[2] === undefined) {
    return undefined
  }
  const version = Number(match[2])
  if (!Number.isSafeInteger(version)) return undefined
  return { id: match[1], version }
}

function parseSimple(
  context: string,
  args: string[],
  positionalCount: number,
): { readonly positional: string[]; readonly json: boolean } | ExtensionsArgs {
  const parsed = parseFlags(args, { booleanFlags: ['json'], strict: true })
  if (parsed.error !== undefined) {
    return unknown(
      `${context}: ${parsed.error.kind} option ${parsed.error.flag}`,
    )
  }
  if (parsed.positional.length !== positionalCount) {
    return unknown(`${context}: invalid arguments`)
  }
  return { positional: parsed.positional, json: parsed.flags.json === true }
}

function parseCatalogArgs(args: string[]): ExtensionsArgs {
  const [subcommand, ...rest] = args
  if (subcommand === 'add') {
    const parsed = parseFlags(rest, {
      booleanFlags: ['trust', 'json'],
      valueFlags: ['ref'],
      strict: true,
    })
    if (parsed.error !== undefined) {
      return unknown(
        `extensions catalog add: ${parsed.error.kind} option ${parsed.error.flag}`,
      )
    }
    if (
      parsed.positional.length !== 2 ||
      typeof parsed.flags.ref !== 'string'
    ) {
      return unknown(
        'extensions catalog add: expected <name> <repository> --ref <full-ref-or-oid> --trust',
      )
    }
    if (parsed.flags.trust !== true) {
      return unknown('extensions catalog add: --trust is required')
    }
    return {
      kind: 'catalog-add',
      name: parsed.positional[0] ?? '',
      repository: parsed.positional[1] ?? '',
      ref: parsed.flags.ref,
      trust: true,
      json: parsed.flags.json === true,
    }
  }
  if (subcommand === 'list') {
    const parsed = parseSimple('extensions catalog list', rest, 0)
    if ('kind' in parsed) return parsed
    return { kind: 'catalog-list', json: parsed.json }
  }
  if (subcommand === 'show') {
    const parsed = parseSimple(
      'extensions catalog show',
      rest,
      rest.filter((item) => !item.startsWith('--')).length,
    )
    if ('kind' in parsed) return parsed
    if (parsed.positional.length < 1 || parsed.positional.length > 2) {
      return unknown(
        'extensions catalog show: expected <name> [<id>@<version>]',
      )
    }
    const selector =
      parsed.positional[1] === undefined
        ? undefined
        : parseSelector(parsed.positional[1])
    if (parsed.positional[1] !== undefined && selector === undefined) {
      return unknown('extensions catalog show: invalid Extension selector')
    }
    return {
      kind: 'catalog-show',
      name: parsed.positional[0] ?? '',
      ...(selector === undefined ? {} : { extension: selector }),
      json: parsed.json,
    }
  }
  if (subcommand === 'refresh' || subcommand === 'remove') {
    const parsed = parseSimple(`extensions catalog ${subcommand}`, rest, 1)
    if ('kind' in parsed) return parsed
    return {
      kind: subcommand === 'refresh' ? 'catalog-refresh' : 'catalog-remove',
      name: parsed.positional[0] ?? '',
      json: parsed.json,
    }
  }
  return unknown(
    `extensions catalog: unknown subcommand ${JSON.stringify(subcommand ?? '')}`,
  )
}

export function parseExtensionsArgs(args: string[]): ExtensionsArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  const [subcommand, ...rest] = args
  if (subcommand === 'list') {
    const parsed = parseSimple('extensions list', rest, 0)
    if ('kind' in parsed) return parsed
    return { kind: 'list', json: parsed.json }
  }
  if (subcommand === 'catalog') return parseCatalogArgs(rest)
  if (subcommand === 'install') {
    const parsed = parseFlags(rest, {
      booleanFlags: ['trust', 'json'],
      strict: true,
    })
    if (parsed.error !== undefined) {
      return unknown(
        `extensions install: ${parsed.error.kind} option ${parsed.error.flag}`,
      )
    }
    const selector =
      parsed.positional[1] === undefined
        ? undefined
        : parseSelector(parsed.positional[1])
    if (parsed.positional.length !== 2 || selector === undefined) {
      return unknown(
        'extensions install: expected <catalog> <id>@<version> --trust',
      )
    }
    if (parsed.flags.trust !== true) {
      return unknown('extensions install: --trust is required')
    }
    return {
      kind: 'install',
      catalog: parsed.positional[0] ?? '',
      extension: selector,
      trust: true,
      json: parsed.flags.json === true,
    }
  }
  if (subcommand === 'uninstall') {
    const parsed = parseSimple('extensions uninstall', rest, 1)
    if ('kind' in parsed) return parsed
    const selector = parseSelector(parsed.positional[0] ?? '')
    if (selector === undefined) {
      return unknown('extensions uninstall: invalid Extension selector')
    }
    return { kind: 'uninstall', extension: selector, json: parsed.json }
  }
  return unknown(
    `extensions: unknown subcommand ${JSON.stringify(subcommand ?? '')}`,
  )
}
