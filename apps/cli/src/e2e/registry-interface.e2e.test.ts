import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '../../../..')
const entrypoint = join(repoRoot, 'apps/cli/bin/ctxindex.mjs')
const extensionPath = join(repoRoot, 'examples/tenders-extension')

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

    const described = await run(['describe', '--format', 'json'])
    expect(described.exitCode, described.stderr).toBe(0)
    expect(described.stderr).toBe('')
    const registry = JSON.parse(described.stdout)
    expect(registry.kinds).toContainEqual(
      expect.objectContaining({
        id: 'ctxindex.demo.tender',
      }),
    )
    expect(registry.sources).toContainEqual(
      expect.objectContaining({ id: 'ctxindex.demo.tenders' }),
    )
    expect(registry.kinds[0]).not.toHaveProperty('fields')
    expect(registry.sources[0]).not.toHaveProperty('config')
    expect(registry.actions[0]).not.toHaveProperty('input')

    const fullRegistry = await run(['describe', '--full', '--format', 'json'])
    expect(fullRegistry.exitCode, fullRegistry.stderr).toBe(0)
    expect(JSON.parse(fullRegistry.stdout).kinds).toContainEqual(
      expect.objectContaining({
        id: 'ctxindex.demo.tender',
        fields: expect.any(Array),
      }),
    )

    const selectedProfile = await run([
      'describe',
      'profile',
      'ctxindex.demo.tender',
      '--format',
      'json',
    ])
    expect(JSON.parse(selectedProfile.stdout)).toEqual(
      expect.objectContaining({
        id: 'ctxindex.demo.tender',
        fields: expect.any(Array),
      }),
    )
    const unknownSelector = await run(['describe', 'kind'])
    expect(unknownSelector.exitCode).toBe(2)
    expect(unknownSelector.stderr).toContain(
      'invalid value for argument selector',
    )
    const unknown = await run(['describe', 'adapter', 'missing'])
    expect(unknown.exitCode).toBe(2)
    expect(unknown.stderr).toContain('unknown adapter id')
    const text = await run(['describe', 'action'])
    expect(text.exitCode, text.stderr).toBe(0)
    expect(text.stdout).toContain('ACTIONS (2)')
    expect(text.stdout).toContain('mail.message.draft.create')
    expect(text.stdout).not.toContain('input:')

    const actionDetail = await run([
      'describe',
      'action',
      'mail.message.draft.create',
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
    expect(actionDetail.stdout).not.toContain('input: {"$schema"')

    const actionJson = await run([
      'describe',
      'action',
      'mail.message.draft.create',
      '--format',
      'json',
    ])
    expect(actionJson.exitCode, actionJson.stderr).toBe(0)
    expect(JSON.parse(actionJson.stdout)).toMatchObject({
      id: 'mail.message.draft.create',
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
    expect(markdown.stdout).toContain('`ctxindex.demo.tender@1`')
    expect(markdown.stdout).not.toContain('`reference` (string)')
    const actionMarkdown = await run([
      'describe',
      'action',
      'mail.message.draft.create',
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
      'environment: clientId=CTXINDEX_GOOGLE_CLIENT_ID, clientSecret=CTXINDEX_GOOGLE_CLIENT_SECRET',
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
      '--format',
      'json',
    ])
    expect(JSON.parse(googleAuthJson.stdout)).toMatchObject({
      id: 'google.mailbox',
      providerApiHosts: ['gmail.googleapis.com'],
      configOptions: [],
      provider: {
        auth: {
          registration: {
            environment: {
              clientId: 'CTXINDEX_GOOGLE_CLIENT_ID',
            },
          },
        },
      },
    })
    expect(googleAuth.stdout).not.toContain('--config-')

    const microsoftMailbox = await run([
      'describe',
      'adapter',
      'microsoft.mailbox',
      '--format',
      'json',
    ])
    expect(microsoftMailbox.exitCode, microsoftMailbox.stderr).toBe(0)
    expect(JSON.parse(microsoftMailbox.stdout)).toMatchObject({
      id: 'microsoft.mailbox',
      routing: 'federated',
      access: { scopes: ['Mail.ReadWrite'] },
      provider: {
        id: 'microsoft',
        auth: {
          kind: 'oauth2',
          authorizationUrl:
            'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
          tokenUrl:
            'https://login.microsoftonline.com/common/oauth2/v2.0/token',
          baseScopes: ['openid', 'offline_access', 'User.Read'],
          registration: {
            environment: {
              clientId: 'CTXINDEX_MICROSOFT_CLIENT_ID',
            },
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
      '--format',
      'json',
    ])
    expect(microsoftCalendar.exitCode, microsoftCalendar.stderr).toBe(0)
    expect(JSON.parse(microsoftCalendar.stdout)).toMatchObject({
      id: 'microsoft.calendar',
      routing: 'indexed',
      profiles: [{ id: 'calendar.event', version: 1 }],
      access: { scopes: ['Calendars.Read'] },
      provider: { auth: { kind: 'oauth2' } },
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
      'ctxindex.demo.tender',
      '--format',
      'markdown',
    ])
    expect(profileMarkdown.exitCode, profileMarkdown.stderr).toBe(0)
    expect(profileMarkdown.stdout).toContain('### ctxindex.demo.tender@1')
    expect(profileMarkdown.stdout).toContain('`reference` (string)')

    const help = await run([])
    expect(help.exitCode, help.stderr).toBe(0)
    expect(help.stdout).toContain('INTERFACE')
    expect(help.stdout).toContain('ctxindex describe --help')
    expect(help.stdout).not.toContain('ctxindex.demo.tender@1')
    expect(help.stdout).toContain('oauth-app')
    expect(help.stdout).not.toMatch(/\bclient\b/i)
    expect(help.stdout).not.toMatch(/\bauth\b/)

    for (const args of [
      ['search', '--help'],
      ['export', '--help'],
      ['action', '--help'],
      ['describe', '--help'],
      ['extension', '--help'],
      ['oauth-app', '--help'],
      ['account', '--help'],
      ['source', '--help'],
    ]) {
      const commandHelp = await run(args)
      expect(commandHelp.exitCode, commandHelp.stderr).toBe(0)
      expect(commandHelp.stdout).not.toContain('INTERFACE')
      expect(commandHelp.stdout).not.toContain('Loaded interface:')
      expect(commandHelp.stdout).not.toContain('ctxindex.demo.tender@1')
      expect(commandHelp.stdout).not.toMatch(/\bGrant\b/)
    }

    const removedClientAlias = await run(['client'])
    expect(removedClientAlias.exitCode).toBe(2)
    expect(removedClientAlias.stderr).toContain('unknown command client')

    const extensions = await run(['extension', 'list', '--format', 'json'])
    expect(extensions.exitCode, extensions.stderr).toBe(0)
    expect(JSON.parse(extensions.stdout)).toContainEqual({
      id: 'ctxindex.demo',
      profiles: [],
      adapters: [{ id: 'ctxindex.demo.tenders' }],
      provenance: {
        id: 'ctxindex.demo',
        kind: 'path',
        path: extensionPath,
      },
    })

    const builtInHelp = await run(['source', 'add', '--help'])
    expect(builtInHelp.exitCode, builtInHelp.stderr).toBe(0)
    expect(builtInHelp.stdout).toContain('--config-root-path')
    expect(builtInHelp.stdout).not.toContain('INTERFACE')
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
    expect(degradedHelp.stdout).not.toContain('ctxindex.demo.tender@1')
    const degradedDescribe = await run(['describe'])
    expect(degradedDescribe.exitCode).toBe(0)
    expect(degradedDescribe.stderr).toContain('missing.ts')
    expect(degradedDescribe.stdout).toContain('ctxindex.demo.tender@1')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)
