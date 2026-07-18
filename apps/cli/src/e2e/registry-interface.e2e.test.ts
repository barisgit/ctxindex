import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '../../../..')
const entrypoint = join(repoRoot, 'apps/cli/bin/ctxindex.mjs')
const extensionPath = join(repoRoot, 'examples/tenders-extension/extension.ts')

test('interpreted registry interface follows an explicit external Extension', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-registry-interface-'))
  const configDir = join(root, 'config')
  const env = {
    ...process.env,
    HOME: join(root, 'home'),
    XDG_CONFIG_HOME: configDir,
    XDG_DATA_HOME: join(root, 'data'),
    XDG_STATE_HOME: join(root, 'state'),
    XDG_CACHE_HOME: join(root, 'cache'),
  }
  const run = async (args: string[]) => {
    const process = Bun.spawn(['bun', entrypoint, ...args], {
      cwd: repoRoot,
      env,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [exitCode, stdout, stderr] = await Promise.all([
      process.exited,
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
    ])
    return { exitCode, stdout, stderr }
  }
  try {
    await mkdir(join(configDir, 'ctxindex'), { recursive: true })
    await writeFile(
      join(configDir, 'ctxindex', 'config.toml'),
      `[extensions]\npaths = ${JSON.stringify([extensionPath])}\n\n[secrets]\nbackend = "keychain"\n\n[log]\nlevel = "info"\n\n[log.file]\nrotate = "daily"\nretain_days = 14\ncompress = true\n`,
    )

    const described = await run(['describe', '--json'])
    expect(described.exitCode, described.stderr).toBe(0)
    expect(described.stderr).toBe('')
    const registry = JSON.parse(described.stdout)
    expect(registry.kinds).toContainEqual(
      expect.objectContaining({
        id: 'enarocanje.tender',
        aliases: ['tenders'],
      }),
    )
    expect(registry.sources).toContainEqual(
      expect.objectContaining({ id: 'enarocanje.fixture' }),
    )
    expect(registry.kinds[0]).not.toHaveProperty('fields')
    expect(registry.sources[0]).not.toHaveProperty('config')
    expect(registry.actions[0]).not.toHaveProperty('input')

    const fullRegistry = await run(['describe', '--full', '--json'])
    expect(fullRegistry.exitCode, fullRegistry.stderr).toBe(0)
    expect(JSON.parse(fullRegistry.stdout).kinds).toContainEqual(
      expect.objectContaining({
        id: 'enarocanje.tender',
        fields: expect.any(Array),
      }),
    )

    const selectedProfile = await run([
      'describe',
      'profile',
      'enarocanje.tender',
      '--json',
    ])
    expect(JSON.parse(selectedProfile.stdout)).toEqual(
      expect.objectContaining({
        id: 'enarocanje.tender',
        fields: expect.any(Array),
      }),
    )
    const unknownSelector = await run(['describe', 'kind'])
    expect(unknownSelector.exitCode).toBe(2)
    expect(unknownSelector.stderr).toContain('unknown selector')
    const unknown = await run(['describe', 'adapter', 'missing'])
    expect(unknown.exitCode).toBe(2)
    expect(unknown.stderr).toContain('unknown adapter id')
    const text = await run(['describe', 'action'])
    expect(text.exitCode, text.stderr).toBe(0)
    expect(text.stdout).toContain('ACTIONS (2)')
    expect(text.stdout).toContain('communication.message.draft.create')
    expect(text.stdout).not.toContain('input:')

    const actionDetail = await run([
      'describe',
      'action',
      'communication.message.draft.create',
    ])
    expect(actionDetail.exitCode, actionDetail.stderr).toBe(0)
    expect(actionDetail.stdout).toContain('  input:\n    branch 1:')
    expect(actionDetail.stdout).toContain(
      '      to <string[]> required\n        min items: 1',
    )
    expect(actionDetail.stdout).toContain(
      '    branch 2:\n      replyToRef <string> required',
    )
    expect(actionDetail.stdout).toContain(
      '      additional properties: not allowed',
    )
    expect(actionDetail.stdout).toContain('"to": [')
    expect(actionDetail.stdout).toContain('"replyToRef":')
    expect(actionDetail.stdout).not.toContain('input: {"$schema"')

    const actionJson = await run([
      'describe',
      'action',
      'communication.message.draft.create',
      '--json',
    ])
    expect(actionJson.exitCode, actionJson.stderr).toBe(0)
    expect(JSON.parse(actionJson.stdout)).toMatchObject({
      id: 'communication.message.draft.create',
      input: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        anyOf: [
          {
            properties: {
              to: { type: 'array', minItems: 1 },
              subject: { type: 'string' },
            },
            required: ['to', 'subject', 'bodyText'],
            additionalProperties: false,
          },
          {
            properties: {
              replyToRef: { type: 'string', minLength: 1 },
              bodyText: { type: 'string' },
            },
            required: ['replyToRef', 'bodyText'],
            additionalProperties: false,
          },
        ],
      },
    })

    const markdown = await run(['describe', '--format', 'markdown'])
    expect(markdown.exitCode, markdown.stderr).toBe(0)
    expect(markdown.stdout).toContain('## Profiles (4)')
    expect(markdown.stdout).toContain('`enarocanje.tender@1`')
    expect(markdown.stdout).not.toContain('`reference` (string)')
    const actionMarkdown = await run([
      'describe',
      'action',
      'communication.message.draft.create',
      '--format',
      'markdown',
    ])
    expect(actionMarkdown.exitCode, actionMarkdown.stderr).toBe(0)
    expect(actionMarkdown.stdout).toContain('##### Branch 1')
    expect(actionMarkdown.stdout).toContain('| `to` | `string[]` | yes |')
    expect(actionMarkdown.stdout).toContain('##### Branch 2')
    expect(actionMarkdown.stdout).toContain('| `replyToRef` | `string` | yes |')

    const googleAuth = await run(['describe', 'adapter', 'google.mailbox'])
    expect(googleAuth.exitCode, googleAuth.stderr).toBe(0)
    expect(googleAuth.stdout).toContain('provider: google')
    expect(googleAuth.stdout).toContain(
      'environment: client-id=CTXINDEX_GOOGLE_CLIENT_ID, client-secret=CTXINDEX_GOOGLE_CLIENT_SECRET',
    )
    expect(googleAuth.stdout).toContain(
      'Adapter scopes: https://www.googleapis.com/auth/gmail.readonly',
    )
    expect(googleAuth.stdout).toContain(
      'provider API hosts: gmail.googleapis.com',
    )
    const googleAuthJson = await run([
      'describe',
      'adapter',
      'google.mailbox',
      '--json',
    ])
    expect(JSON.parse(googleAuthJson.stdout)).toMatchObject({
      id: 'google.mailbox',
      providerApiHosts: ['gmail.googleapis.com'],
      configOptions: [],
      auth: {
        provider: {
          environment: {
            clientId: 'CTXINDEX_GOOGLE_CLIENT_ID',
          },
        },
      },
    })
    expect(googleAuth.stdout).not.toContain('--config-')

    const microsoftMailbox = await run([
      'describe',
      'adapter',
      'microsoft.mailbox',
      '--json',
    ])
    expect(microsoftMailbox.exitCode, microsoftMailbox.stderr).toBe(0)
    expect(JSON.parse(microsoftMailbox.stdout)).toMatchObject({
      id: 'microsoft.mailbox',
      routing: 'federated',
      auth: {
        kind: 'oauth2',
        scopes: ['Mail.ReadWrite'],
        provider: {
          id: 'microsoft',
          authorizationUrl:
            'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
          tokenUrl:
            'https://login.microsoftonline.com/common/oauth2/v2.0/token',
          baseScopes: ['openid', 'offline_access', 'User.Read'],
          environment: {
            clientId: 'CTXINDEX_MICROSOFT_CLIENT_ID',
          },
        },
      },
      providerApiHosts: ['graph.microsoft.com'],
      capabilities: ['download', 'retrieve', 'search-remote'],
    })
    expect(microsoftMailbox.stdout).not.toMatch(/Mail\.Send|sendMail/)

    const microsoftCalendar = await run([
      'describe',
      'adapter',
      'microsoft.calendar',
      '--json',
    ])
    expect(microsoftCalendar.exitCode, microsoftCalendar.stderr).toBe(0)
    expect(JSON.parse(microsoftCalendar.stdout)).toMatchObject({
      id: 'microsoft.calendar',
      routing: 'indexed',
      profiles: [{ id: 'calendar.event', version: 1 }],
      auth: { kind: 'oauth2', scopes: ['Calendars.Read'] },
      providerApiHosts: ['graph.microsoft.com'],
      capabilities: ['retrieve', 'sync'],
      configOptions: [
        expect.objectContaining({ flag: '--config-calendar-id' }),
        expect.objectContaining({ flag: '--config-future-days' }),
        expect.objectContaining({ flag: '--config-past-days' }),
      ],
    })
    expect(microsoftCalendar.stdout).not.toMatch(
      /Calendars\.ReadWrite|Mail\.Send|sendMail/,
    )

    const profileMarkdown = await run([
      'describe',
      'profile',
      'enarocanje.tender',
      '--format',
      'markdown',
    ])
    expect(profileMarkdown.exitCode, profileMarkdown.stderr).toBe(0)
    expect(profileMarkdown.stdout).toContain('### enarocanje.tender@1')
    expect(profileMarkdown.stdout).toContain('`reference` (string)')

    const help = await run([])
    expect(help.exitCode, help.stderr).toBe(0)
    expect(help.stdout).toContain('INTERFACE')
    expect(help.stdout).toContain('ctxindex describe <type> <id> --json')
    expect(help.stdout).not.toContain('enarocanje.tender@1')
    expect(help.stdout).toContain('client')
    expect(help.stdout).not.toMatch(/\bauth\b/)

    for (const args of [
      ['search', '--help'],
      ['export', '--help'],
      ['action', '--help'],
      ['describe', '--help'],
      ['extensions', '--help'],
      ['client', '--help'],
      ['account', '--help'],
    ]) {
      const commandHelp = await run(args)
      expect(commandHelp.exitCode, commandHelp.stderr).toBe(0)
      expect(commandHelp.stdout).toContain('INTERFACE')
      expect(commandHelp.stdout).toContain(
        'ctxindex describe <type> <id> --json',
      )
      expect(commandHelp.stdout).not.toContain('Loaded interface:')
      expect(commandHelp.stdout).not.toContain('enarocanje.tender@1')
    }

    const extensions = await run(['extensions', 'list', '--json'])
    expect(extensions.exitCode, extensions.stderr).toBe(0)
    expect(JSON.parse(extensions.stdout)).toContainEqual({
      id: 'enarocanje.proof',
      version: 1,
      profiles: [{ id: 'enarocanje.tender', version: 1 }],
      adapters: [{ id: 'enarocanje.fixture', version: 1 }],
      summary: 'External tenders Extension proof.',
      provenance: {
        id: 'enarocanje.proof',
        version: 1,
        kind: 'path',
        path: extensionPath,
      },
    })

    const builtInHelp = await run(['source', 'add', '--help'])
    expect(builtInHelp.exitCode, builtInHelp.stderr).toBe(0)
    expect(builtInHelp.stdout).toContain('--config-root-path')
    expect(builtInHelp.stdout).toContain('ctxindex describe <type> <id>')
    const localDetail = await run(['describe', 'adapter', 'local.directory'])
    expect(localDetail.exitCode, localDetail.stderr).toBe(0)
    expect(localDetail.stdout).toContain('--config-root-path')

    await writeFile(
      join(configDir, 'ctxindex', 'config.toml'),
      `[extensions]\npaths = ${JSON.stringify([extensionPath, join(root, 'missing.ts')])}\n\n[secrets]\nbackend = "keychain"\n\n[log]\nlevel = "info"\n\n[log.file]\nrotate = "daily"\nretain_days = 14\ncompress = true\n`,
    )
    const degradedHelp = await run(['--help'])
    expect(degradedHelp.exitCode).toBe(0)
    expect(degradedHelp.stderr).toBe('')
    expect(degradedHelp.stdout).not.toContain('enarocanje.tender@1')
    const degradedDescribe = await run(['describe'])
    expect(degradedDescribe.exitCode).toBe(0)
    expect(degradedDescribe.stderr).toContain('missing.ts')
    expect(degradedDescribe.stdout).toContain('enarocanje.tender@1')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
