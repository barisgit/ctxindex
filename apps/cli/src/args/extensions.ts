import { hasHelpFlag, parseFlags } from './flags'

export type ExtensionsArgs =
  | { readonly kind: 'list'; readonly json: boolean }
  | {
      readonly kind: 'search'
      readonly query?: string
      readonly noRefresh: boolean
      readonly json: boolean
    }
  | {
      readonly kind: 'catalog-build'
      readonly packageRoot: string
      readonly catalogId?: string
      readonly output?: string
      readonly trust: true
      readonly json: boolean
    }
  | {
      readonly kind: 'catalog-add'
      readonly name: string
      readonly repository: string
      readonly ref: string
      readonly trust: true
      readonly json: boolean
    }
  | {
      readonly kind: 'catalog-list'
      readonly noRefresh: boolean
      readonly json: boolean
    }
  | {
      readonly kind: 'catalog-show'
      readonly name: string
      readonly extensionId?: string
      readonly noRefresh: boolean
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
      readonly kind: 'catalog-install'
      readonly catalog: string
      readonly extensionId: string
      readonly trust: true
      readonly noRefresh: boolean
      readonly json: boolean
    }
  | {
      readonly kind: 'direct-install'
      readonly sourceKind: 'npm' | 'git' | 'local'
      readonly target: string
      readonly extensionId: string
      readonly json: boolean
    }
  | {
      readonly kind: 'direct-update'
      readonly extensionId: string
      readonly json: boolean
    }
  | {
      readonly kind: 'uninstall'
      readonly extensionId: string
      readonly force: boolean
      readonly json: boolean
    }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

function unknown(message: string): ExtensionsArgs {
  return { kind: 'unknown', message }
}

function isStableExtensionId(value: string): boolean {
  return value.length <= 128 && /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value)
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

function parseCatalogRead(
  context: string,
  args: string[],
  positionalCount: number,
):
  | {
      readonly positional: string[]
      readonly noRefresh: boolean
      readonly json: boolean
    }
  | ExtensionsArgs {
  const parsed = parseFlags(args, {
    booleanFlags: ['no-refresh', 'json'],
    strict: true,
  })
  if (parsed.error !== undefined) {
    return unknown(
      `${context}: ${parsed.error.kind} option ${parsed.error.flag}`,
    )
  }
  if (parsed.positional.length !== positionalCount) {
    return unknown(`${context}: invalid arguments`)
  }
  return {
    positional: parsed.positional,
    noRefresh: parsed.flags['no-refresh'] === true,
    json: parsed.flags.json === true,
  }
}

function parseCatalogArgs(args: string[]): ExtensionsArgs {
  const [subcommand, ...rest] = args
  if (subcommand === 'build') {
    const parsed = parseFlags(rest, {
      booleanFlags: ['trust', 'json'],
      valueFlags: ['catalog', 'output'],
      strict: true,
    })
    if (parsed.error !== undefined) {
      return unknown(
        `extensions catalog build: ${parsed.error.kind} option ${parsed.error.flag}`,
      )
    }
    if (parsed.positional.length !== 1) {
      return unknown(
        'extensions catalog build: expected <package-root> [--catalog <id>] [--output <manifest-path>]',
      )
    }
    if (parsed.flags.trust !== true) {
      return unknown('extensions catalog build: --trust is required')
    }
    if (
      parsed.flags.catalog !== undefined &&
      (typeof parsed.flags.catalog !== 'string' ||
        !isStableExtensionId(parsed.flags.catalog))
    ) {
      return unknown('extensions catalog build: invalid Catalog id')
    }
    return {
      kind: 'catalog-build',
      packageRoot: parsed.positional[0] ?? '',
      ...(typeof parsed.flags.catalog === 'string'
        ? { catalogId: parsed.flags.catalog }
        : {}),
      ...(typeof parsed.flags.output === 'string'
        ? { output: parsed.flags.output }
        : {}),
      trust: true,
      json: parsed.flags.json === true,
    }
  }
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
    const parsed = parseCatalogRead('extensions catalog list', rest, 0)
    if ('kind' in parsed) return parsed
    return {
      kind: 'catalog-list',
      noRefresh: parsed.noRefresh,
      json: parsed.json,
    }
  }
  if (subcommand === 'show') {
    const parsed = parseCatalogRead(
      'extensions catalog show',
      rest,
      rest.filter((item) => !item.startsWith('--')).length,
    )
    if ('kind' in parsed) return parsed
    if (parsed.positional.length < 1 || parsed.positional.length > 2) {
      return unknown(
        'extensions catalog show: expected <name> [<extension-id>]',
      )
    }
    const extensionId = parsed.positional[1]
    if (extensionId !== undefined && !isStableExtensionId(extensionId)) {
      return unknown('extensions catalog show: invalid Extension selector')
    }
    return {
      kind: 'catalog-show',
      name: parsed.positional[0] ?? '',
      ...(extensionId === undefined ? {} : { extensionId }),
      noRefresh: parsed.noRefresh,
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
  if (subcommand === 'search') {
    const parsed = parseFlags(rest, {
      booleanFlags: ['no-refresh', 'json'],
      strict: true,
    })
    if (parsed.error !== undefined) {
      return unknown(
        `extensions search: ${parsed.error.kind} option ${parsed.error.flag}`,
      )
    }
    if (parsed.positional.length > 1) {
      return unknown('extensions search: expected [query]')
    }
    return {
      kind: 'search',
      ...(parsed.positional[0] === undefined
        ? {}
        : { query: parsed.positional[0] }),
      noRefresh: parsed.flags['no-refresh'] === true,
      json: parsed.flags.json === true,
    }
  }
  if (subcommand === 'catalog') return parseCatalogArgs(rest)
  if (subcommand === 'install') {
    const directKind = rest[0]
    if (
      (directKind === 'npm' ||
        directKind === 'git' ||
        directKind === 'local') &&
      rest.some(
        (argument) =>
          argument === '--extension' || argument.startsWith('--extension='),
      )
    ) {
      const parsed = parseFlags(rest, {
        booleanFlags: ['json'],
        valueFlags: ['extension'],
        strict: true,
      })
      if (parsed.error !== undefined) {
        return unknown(
          `extensions install: ${parsed.error.kind} option ${parsed.error.flag}`,
        )
      }
      if (
        parsed.positional.length !== 2 ||
        typeof parsed.flags.extension !== 'string' ||
        parsed.flags.extension.length === 0
      ) {
        return unknown(
          'extensions install: expected <npm|git|local> <target> --extension <id>',
        )
      }
      return {
        kind: 'direct-install',
        sourceKind: directKind,
        target: parsed.positional[1] ?? '',
        extensionId: parsed.flags.extension,
        json: parsed.flags.json === true,
      }
    }
    const parsed = parseFlags(rest, {
      booleanFlags: ['trust', 'no-refresh', 'json'],
      strict: true,
    })
    if (parsed.error !== undefined) {
      return unknown(
        `extensions install: ${parsed.error.kind} option ${parsed.error.flag}`,
      )
    }
    const extensionId = parsed.positional[1]
    if (
      parsed.positional.length !== 2 ||
      extensionId === undefined ||
      !isStableExtensionId(extensionId)
    ) {
      return unknown(
        'extensions install: expected <catalog> <extension-id> --trust',
      )
    }
    if (parsed.flags.trust !== true) {
      return unknown('extensions install: --trust is required')
    }
    return {
      kind: 'catalog-install',
      catalog: parsed.positional[0] ?? '',
      extensionId,
      trust: true,
      noRefresh: parsed.flags['no-refresh'] === true,
      json: parsed.flags.json === true,
    }
  }
  if (subcommand === 'update') {
    const parsed = parseSimple('extensions update', rest, 1)
    if ('kind' in parsed) return parsed
    return {
      kind: 'direct-update',
      extensionId: parsed.positional[0] ?? '',
      json: parsed.json,
    }
  }
  if (subcommand === 'uninstall') {
    const parsed = parseFlags(rest, {
      booleanFlags: ['force', 'json'],
      strict: true,
    })
    if (parsed.error !== undefined) {
      return unknown(
        `extensions uninstall: ${parsed.error.kind} option ${parsed.error.flag}`,
      )
    }
    if (parsed.positional.length !== 1) {
      return unknown('extensions uninstall: invalid arguments')
    }
    const value = parsed.positional[0] ?? ''
    if (!isStableExtensionId(value)) {
      return unknown('extensions uninstall: invalid Extension selector')
    }
    return {
      kind: 'uninstall',
      extensionId: value,
      force: parsed.flags.force === true,
      json: parsed.flags.json === true,
    }
  }
  return unknown(
    `extensions: unknown subcommand ${JSON.stringify(subcommand ?? '')}`,
  )
}
