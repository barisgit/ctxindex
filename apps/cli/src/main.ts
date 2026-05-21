import { handleAuthCommand } from './commands/auth'
import { getDb } from './commands/db'
import { initCtxindex } from './commands/init'
import { realmAdd, realmList } from './commands/realm'
import { handleSecretsCommand } from './commands/secrets'
import { sourceAdd, sourceList, sourceRemove } from './commands/source'
import { getStatus } from './commands/status'
import { getSkillContent, listSkills } from './skills/loader'
import { resolveBundledSkillsDir } from './skills/resolve'

const rootPackageUrl = new URL('../../../package.json', import.meta.url)

type RootPackage = {
  version?: string
}

async function readVersion(): Promise<string> {
  const rootPackage = (await Bun.file(rootPackageUrl).json()) as RootPackage
  return rootPackage.version ?? '0.0.0'
}

const helpText = `ctxindex

Usage:
  ctxindex <command> [options]

Commands:
  init
  auth add <provider> [--client-id <id>] [--client-secret <secret>] [--auth-code <code>]
  auth list [--json]
  realm add <slug>
  realm list [--json]
  source add <adapter-id> [--realm <slug>] [--config-json <json>]
  source list [--realm <slug>] [--json]
  source remove <source-id>
  sync [--source <id>] [--mode sync|resync|diff]
  search <query> [--realm ...] [--source ...] [--adapter ...] [--kind ...] [--since ...] [--until ...] [--include-deleted] [--explain] [--json]
  status [--source <id>] [--json]
  secrets migrate <backend>
  skills list | get <name> [--inline] | path

Use 'ctxindex <command> --help' for command-specific options.
`

const helpByCommand: Record<string, string> = {
  init: 'ctxindex init\n\nInitialise XDG layout, config.toml, ctxindex.sqlite, and the seeded global realm.',
  realm: 'ctxindex realm <subcommand>\n\nSubcommands:\n  add <slug>         Create a realm.\n  list [--json]      List existing realms.',
  source: 'ctxindex source <subcommand>\n\nSubcommands:\n  add <adapter-id> [--realm <slug>] [--display-name <name>] [--config-json <json>]\n  list [--realm <slug>] [--json]\n  remove <source-id>',
  auth: 'ctxindex auth <subcommand>\n\nSubcommands:\n  add google --client-id <id> --client-secret <secret> --auth-code <code>\n  list [--json]',
  secrets: 'ctxindex secrets <subcommand>\n\nSubcommands:\n  migrate <keychain|file> [--passphrase <pw>]',
  skills: 'ctxindex skills <subcommand>\n\nSubcommands:\n  list [--json]\n  get <name> [--inline] [--json]\n  path',
  status: 'ctxindex status [--source <id>] [--json]\n\nShow last sync status for each source.',
  sync: 'ctxindex sync [--source <id>] [--mode sync|resync|diff]\n\nRun a sync for one or all sources.',
  search: 'ctxindex search <query> [--realm ...] [--source ...] [--adapter ...] [--kind ...] [--since ...] [--until ...] [--include-deleted] [--explain] [--json]',
}

function hasHelpFlag(args: string[]): boolean {
  return args.includes('--help') || args.includes('-h')
}

function parseFlags(args: string[]): {
  flags: Record<string, boolean | string>
  positional: string[]
} {
  const flags: Record<string, boolean | string> = {}
  const positional: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === undefined) continue
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = args[i + 1]
      if (next !== undefined && !next.startsWith('-')) {
        flags[key] = next
        i++
      } else {
        flags[key] = true
      }
    } else {
      positional.push(arg)
    }
  }
  return { flags, positional }
}

async function handleSkills(args: string[]): Promise<number> {
  if (hasHelpFlag(args)) {
    console.log(helpByCommand.skills)
    return 0
  }
  const [subCmd, ...rest] = args
  const { flags, positional } = parseFlags(rest)
  const skillsDir = resolveBundledSkillsDir()

  if (subCmd === 'list') {
    const skills = await listSkills(skillsDir)
    if (flags.json === true) {
      console.log(JSON.stringify(skills, null, 2))
    } else {
      for (const skill of skills) {
        console.log(`${skill.name}\t${skill.summary}`)
      }
    }
    return 0
  }

  if (subCmd === 'get') {
    const name = positional[0]
    if (!name) {
      console.error('skills get: missing skill name')
      return 1
    }
    const skill = await getSkillContent(skillsDir, name, {
      inline: flags.inline === true,
    })
    if (flags.json === true) {
      console.log(JSON.stringify(skill, null, 2))
    } else {
      console.log(skill.content)
    }
    return 0
  }

  if (subCmd === 'path') {
    console.log(skillsDir)
    return 0
  }

  console.error(`skills: unknown subcommand "${subCmd ?? ''}"`)
  return 1
}

async function handleRealm(args: string[]): Promise<number> {
  if (hasHelpFlag(args)) {
    console.log(helpByCommand.realm)
    return 0
  }
  const [subCmd, ...rest] = args
  const { flags, positional } = parseFlags(rest)

  if (subCmd === 'add') {
    const slug = positional[0]
    if (!slug) {
      console.error('realm add: missing <slug>')
      return 2
    }
    const db = await getDb()
    try {
      realmAdd(db, slug)
      console.log(`realm added: ${slug}`)
      return 0
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      return 1
    }
  }

  if (subCmd === 'list') {
    const db = await getDb()
    const realms = realmList(db)
    if (flags.json === true) {
      console.log(JSON.stringify(realms, null, 2))
    } else {
      for (const r of realms) {
        console.log(`${r.slug}${r.is_default ? ' (default)' : ''}`)
      }
    }
    return 0
  }

  console.error(
    `realm: unknown subcommand "${subCmd ?? ''}". Try: realm add <slug> | realm list`,
  )
  return 2
}

async function handleSource(args: string[]): Promise<number> {
  if (hasHelpFlag(args)) {
    console.log(helpByCommand.source)
    return 0
  }
  const [subCmd, ...rest] = args
  const { flags, positional } = parseFlags(rest)

  if (subCmd === 'add') {
    const adapterId = positional[0]
    if (!adapterId) {
      console.error('source add: missing <adapter-id>')
      return 2
    }
    const db = await getDb()
    try {
      const sourceOpts: {
        realmSlug?: string
        displayName?: string
        configJson?: string
      } = {}
      if (typeof flags.realm === 'string') sourceOpts.realmSlug = flags.realm
      if (typeof flags['display-name'] === 'string')
        sourceOpts.displayName = flags['display-name']
      if (typeof flags['config-json'] === 'string')
        sourceOpts.configJson = flags['config-json']
      const id = sourceAdd(db, adapterId, sourceOpts)
      console.log(`source added: ${id}`)
      return 0
    } catch (err) {
      const code = (err as { exitCode?: number }).exitCode ?? 1
      console.error(err instanceof Error ? err.message : String(err))
      return code
    }
  }

  if (subCmd === 'list') {
    const db = await getDb()
    const realmSlug = typeof flags.realm === 'string' ? flags.realm : undefined
    const sources = sourceList(db, realmSlug)
    if (flags.json === true) {
      console.log(JSON.stringify(sources, null, 2))
    } else {
      for (const s of sources) {
        console.log(`${s.id}\t${s.adapter_id}`)
      }
    }
    return 0
  }

  if (subCmd === 'remove') {
    const sourceId = positional[0]
    if (!sourceId) {
      console.error('source remove: missing <source-id>')
      return 2
    }
    const db = await getDb()
    try {
      sourceRemove(db, sourceId)
      console.log(`source removed: ${sourceId}`)
      return 0
    } catch (err) {
      const code = (err as { exitCode?: number }).exitCode ?? 1
      console.error(err instanceof Error ? err.message : String(err))
      return code
    }
  }

  console.error(
    `source: unknown subcommand "${subCmd ?? ''}". Try: source add | source list | source remove`,
  )
  return 2
}

async function handleStatus(args: string[]): Promise<number> {
  if (hasHelpFlag(args)) {
    console.log(helpByCommand.status)
    return 0
  }
  const { flags, positional: _positional } = parseFlags(args)
  const db = await getDb()
  const sourceId = typeof flags.source === 'string' ? flags.source : undefined
  const rows = getStatus(db, sourceId)
  if (flags.json === true) {
    console.log(JSON.stringify(rows, null, 2))
  } else {
    for (const r of rows) {
      console.log(
        `${r.source_id}\t${r.adapter_id}\t${r.realm_slug}\t${r.last_status}`,
      )
    }
  }
  return 0
}

export async function runCli(args: string[]): Promise<number> {
  const [firstArg] = args

  if (firstArg === '--version' || firstArg === '-v') {
    console.log(`ctxindex ${await readVersion()}`)
    return 0
  }

  if (firstArg === '--help' || firstArg === '-h' || firstArg === undefined) {
    console.log(helpText)
    return 0
  }

  if (firstArg === 'init') {
    await initCtxindex()
    console.log('ctxindex initialized')
    return 0
  }

  if (firstArg === 'skills') {
    try {
      return await handleSkills(args.slice(1))
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      return 1
    }
  }

  if (firstArg === 'secrets') {
    if (hasHelpFlag(args.slice(1))) {
      console.log(helpByCommand.secrets)
      return 0
    }
    return handleSecretsCommand(args.slice(1))
  }

  if (firstArg === 'realm') {
    try {
      return await handleRealm(args.slice(1))
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      return 1
    }
  }

  if (firstArg === 'source') {
    try {
      return await handleSource(args.slice(1))
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      return 1
    }
  }

  if (firstArg === 'status') {
    try {
      return await handleStatus(args.slice(1))
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      return 1
    }
  }

  if (firstArg === 'auth') {
    if (hasHelpFlag(args.slice(1))) {
      console.log(helpByCommand.auth)
      return 0
    }
    return handleAuthCommand(args.slice(1))
  }

  // Commands pending CLI wiring — library exists; CLI plumbing is follow-up work.
  const pendingCommands = ['sync', 'search']
  if (pendingCommands.includes(firstArg)) {
    if (hasHelpFlag(args.slice(1))) {
      console.log(helpByCommand[firstArg])
      return 0
    }
    console.error(
      `ctxindex: "${firstArg}" CLI wiring not yet shipped; library covered by integration tests. Run ctxindex --help.`,
    )
    return 2
  }

  console.error(`ctxindex: unknown command "${args.join(' ')}"`)
  console.error('Run ctxindex --help for the v1 command list.')

  return 2
}
