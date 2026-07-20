import { expect } from 'bun:test'
import { chmod, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Sandbox } from '@ctxindex/core/testing'
import { startMockGmail } from './_mock-gmail'
import { startMockGraph } from './_mock-graph'
import { installLoopbackBrowser } from './_oauth-account'
import {
  gmailMailboxReplayMessages,
  mailboxReplayFixture,
  microsoftMailboxReplayMessages,
} from './fixtures/mailbox-retrieval-artifact-replay'

interface CliResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

export interface CompiledCliHarness {
  run(
    args: readonly string[],
    env: Readonly<Record<string, string | undefined>>,
  ): Promise<CliResult>
  cleanup(): Promise<void>
}

interface SafeRequest {
  readonly method: string
  readonly pathname: string
  readonly search: string
}

interface ActiveMailboxReplayDriver {
  readonly env: Readonly<Record<string, string | undefined>>
  readonly attachmentFilename: string
  readonly attachmentSuffix: string
  readonly expectedSearchRequests: readonly SafeRequest[]
  readonly expectedRetrieveRequests: readonly SafeRequest[]
  readonly expectedDownloadRequests: readonly SafeRequest[]
  safeRequests(): readonly SafeRequest[]
  resetRequests(): void
  offlineEnv(): Readonly<Record<string, string | undefined>>
  stop(): void
}

export interface MailboxReplayDriver {
  readonly provider: 'google' | 'microsoft'
  readonly adapterId: 'google.mailbox' | 'microsoft.mailbox'
  start(stateDir: string): Promise<ActiveMailboxReplayDriver>
}

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const unreachableLoopback = 'http://127.0.0.1:1'
const realm = 'invented-mailbox-replay'
const foreignSourceId = '01ARZ3NDEKTSV4RRFFQ69G5FAV'

function safeGet(
  pathname: string,
  params: readonly (readonly [string, string])[] = [],
): SafeRequest {
  const url = new URL(`https://provider.example.test${pathname}`)
  for (const [name, value] of params) url.searchParams.append(name, value)
  return { method: 'GET', pathname, search: url.search }
}

function isolatedEnv(
  stateDir: string,
  browserBin: string,
): Record<string, string | undefined> {
  return {
    XDG_CONFIG_HOME: join(stateDir, 'config'),
    XDG_DATA_HOME: join(stateDir, 'data'),
    XDG_STATE_HOME: join(stateDir, 'state'),
    XDG_CACHE_HOME: join(stateDir, 'cache'),
    PATH: `${browserBin}:${process.env.PATH ?? ''}`,
    CTXINDEX_LOOPBACK_TIMEOUT_SECS: '5',
  }
}

const googleDriver: MailboxReplayDriver = {
  provider: 'google',
  adapterId: 'google.mailbox',
  async start(stateDir) {
    const sandbox = { dir: stateDir } as Sandbox
    const server = startMockGmail({
      identitySubject: 'invented-google-replay-subject',
      identityEmail: 'invented-google-replay@example.test',
      messages: gmailMailboxReplayMessages,
      listOrder: [
        mailboxReplayFixture.rootProviderId,
        mailboxReplayFixture.replyProviderId,
      ],
    })
    try {
      const browserBin = await installLoopbackBrowser(stateDir)
      const env = server.env(sandbox, isolatedEnv(stateDir, browserBin))
      const metadataParams = [
        ['fields', 'id,threadId,labelIds,snippet,internalDate,payload/headers'],
        ...[
          'Subject',
          'From',
          'To',
          'Date',
          'Message-ID',
          'In-Reply-To',
          'References',
          'Reply-To',
        ].map((name) => ['metadataHeaders', name] as const),
      ] as const
      return {
        env,
        attachmentFilename: 'mock.txt',
        attachmentSuffix: `${mailboxReplayFixture.replyProviderId}-attachment`,
        expectedSearchRequests: [
          safeGet('/gmail/v1/users/me/messages', [
            ['q', `${mailboxReplayFixture.query} -in:drafts`],
            ['maxResults', '20'],
          ]),
          ...[
            mailboxReplayFixture.rootProviderId,
            mailboxReplayFixture.replyProviderId,
          ].map((id) =>
            safeGet(`/gmail/v1/users/me/messages/${id}`, [
              ['format', 'metadata'],
              ...metadataParams,
            ]),
          ),
        ],
        expectedRetrieveRequests: [
          safeGet(
            `/gmail/v1/users/me/messages/${mailboxReplayFixture.replyProviderId}`,
            [['format', 'full']],
          ),
        ],
        expectedDownloadRequests: [
          safeGet(
            `/gmail/v1/users/me/messages/${mailboxReplayFixture.replyProviderId}/attachments/${mailboxReplayFixture.replyProviderId}-attachment`,
          ),
        ],
        safeRequests: () => server.readRequests(),
        resetRequests: () => server.resetRequests(),
        offlineEnv: () => ({
          ...env,
          CTXINDEX_GMAIL_MOCK_BASE_URL: unreachableLoopback,
          CTXINDEX_OAUTH_MOCK_BASE_URL: unreachableLoopback,
        }),
        stop: () => server.stop(),
      }
    } catch (error) {
      server.stop()
      throw error
    }
  },
}

const microsoftDriver: MailboxReplayDriver = {
  provider: 'microsoft',
  adapterId: 'microsoft.mailbox',
  async start(stateDir) {
    const sandbox = { dir: stateDir } as Sandbox
    const server = startMockGraph({
      messages: microsoftMailboxReplayMessages,
      tokenScopes: 'Calendars.Read Mail.ReadWrite User.Read',
    })
    try {
      const browserBin = await installLoopbackBrowser(stateDir)
      const env = server.env(sandbox, isolatedEnv(stateDir, browserBin))
      const messagePath = `/v1.0/me/messages/${mailboxReplayFixture.replyProviderId}`
      return {
        env,
        attachmentFilename: 'invented-mailbox-replay.txt',
        attachmentSuffix: 'invented-replay-attachment',
        expectedSearchRequests: [
          safeGet('/v1.0/me/messages', [
            ['$search', `"${mailboxReplayFixture.query}"`],
            ['$top', '20'],
            [
              '$select',
              'id,conversationId,internetMessageId,subject,bodyPreview,from,toRecipients,receivedDateTime,sentDateTime,lastModifiedDateTime,isRead,isDraft,categories',
            ],
          ]),
        ],
        expectedRetrieveRequests: [
          safeGet(messagePath, [
            [
              '$select',
              'id,conversationId,internetMessageId,internetMessageHeaders,subject,bodyPreview,body,from,replyTo,toRecipients,ccRecipients,bccRecipients,receivedDateTime,sentDateTime,lastModifiedDateTime,isRead,isDraft,categories,hasAttachments',
            ],
          ]),
          {
            method: 'GET',
            pathname: `${messagePath}/attachments`,
            search: '?$select=id,name,contentType,isInline',
          },
        ],
        expectedDownloadRequests: [
          safeGet(
            `${messagePath}/attachments/invented-replay-attachment/$value`,
          ),
        ],
        safeRequests: () =>
          server.readRequests().map(({ method, pathname, search }) => ({
            method,
            pathname,
            search,
          })),
        resetRequests: () => server.resetRequests(),
        offlineEnv: () => ({
          ...env,
          CTXINDEX_GRAPH_MOCK_BASE_URL: unreachableLoopback,
          CTXINDEX_OAUTH_MOCK_BASE_URL: unreachableLoopback,
        }),
        stop: () => server.stop(),
      }
    } catch (error) {
      server.stop()
      throw error
    }
  },
}

export const mailboxReplayDrivers: readonly MailboxReplayDriver[] = [
  googleDriver,
  microsoftDriver,
]

export function isolatedChildEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
}

export async function buildCompiledCliHarness(): Promise<CompiledCliHarness> {
  const dir = await mkdtemp(join(tmpdir(), 'ctxindex-mailbox-replay-bin-'))
  const buildDir = join(dir, 'build')
  const relocatedDir = join(dir, 'relocated')
  const buildPath = join(buildDir, 'ctxindex')
  const relocatedPath = join(relocatedDir, 'ctxindex')
  await mkdir(buildDir, { recursive: true })
  await mkdir(relocatedDir, { recursive: true })

  const build = Bun.spawn(
    [
      'bun',
      'build',
      '--compile',
      'apps/cli/bin/ctxindex.mjs',
      '--outfile',
      buildPath,
    ],
    { cwd: repoRoot, stdout: 'pipe', stderr: 'pipe' },
  )
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(build.stdout).text(),
    new Response(build.stderr).text(),
    build.exited,
  ])
  expect(exitCode, `${stdout}\n${stderr}`).toBe(0)
  await Bun.write(relocatedPath, Bun.file(buildPath))
  await chmod(relocatedPath, 0o755)
  await rm(buildDir, { recursive: true })

  return {
    async run(args, env) {
      const child = Bun.spawn([relocatedPath, ...args], {
        cwd: '/',
        env: isolatedChildEnvironment(env),
        stdin: null,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [childStdout, childStderr, childExitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ])
      return {
        stdout: childStdout,
        stderr: childStderr,
        exitCode: childExitCode,
      }
    },
    cleanup: () => rm(dir, { recursive: true, force: true }),
  }
}

async function runOk(
  harness: CompiledCliHarness,
  env: Readonly<Record<string, string | undefined>>,
  args: readonly string[],
): Promise<CliResult> {
  const result = await harness.run(args, env)
  expect(result.exitCode, `${args.join(' ')}\n${result.stderr}`).toBe(0)
  return result
}

function parseSourceId(stdout: string): string {
  const match = /^source added: (.+)$/m.exec(stdout)
  if (!match?.[1]) throw new Error(`Could not parse Source id from: ${stdout}`)
  return match[1]
}

function providerRequests(
  driver: MailboxReplayDriver,
  active: ActiveMailboxReplayDriver,
): readonly SafeRequest[] {
  const prefix = driver.provider === 'google' ? '/gmail/' : '/v1.0/'
  return active
    .safeRequests()
    .filter(({ pathname }) => pathname.startsWith(prefix))
}

function flattenThreadRefs(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) return []
  const candidate = value as {
    resource?: { ref?: unknown }
    children?: unknown[]
    messages?: unknown[]
  }
  return [
    ...(typeof candidate.resource?.ref === 'string'
      ? [candidate.resource.ref]
      : []),
    ...(candidate.children ?? []).flatMap(flattenThreadRefs),
    ...(candidate.messages ?? []).flatMap(flattenThreadRefs),
  ]
}

export async function runMailboxRetrievalArtifactReplay(
  harness: CompiledCliHarness,
  driver: MailboxReplayDriver,
): Promise<void> {
  const stateDir = await mkdtemp(
    join(tmpdir(), `ctxindex-${driver.provider}-mailbox-replay-`),
  )
  let active: ActiveMailboxReplayDriver | undefined
  try {
    active = await driver.start(stateDir)
    const accountLabel = `invented-${driver.provider}-replay`
    const sourceLabel = `${accountLabel}-mailbox`
    for (const command of [
      ['init'],
      ['realm', 'add', realm],
      ['oauth-app', 'add', driver.provider, driver.provider, '--from-env'],
      [
        'account',
        'add',
        driver.provider,
        '--app',
        driver.provider,
        '--label',
        accountLabel,
      ],
    ] as const) {
      await runOk(harness, active.env, command)
    }
    const added = await runOk(harness, active.env, [
      'source',
      'add',
      driver.adapterId,
      '--realm',
      realm,
      '--account',
      accountLabel,
      '--label',
      sourceLabel,
    ])
    const sourceId = parseSourceId(added.stdout)
    const rootRef = `ctx://${sourceId}/message/${mailboxReplayFixture.rootProviderId}`
    const replyRef = `ctx://${sourceId}/message/${mailboxReplayFixture.replyProviderId}`
    const artifactRef = `${replyRef}/attachment/${active.attachmentSuffix}`

    active.resetRequests()
    const searched = await runOk(harness, active.env, [
      'search',
      mailboxReplayFixture.query,
      '--source',
      sourceLabel,
      '--remote',
      '--json',
    ])
    const searchJson = JSON.parse(searched.stdout) as {
      results: Array<{ ref: string }>
    }
    expect(searchJson.results.map(({ ref }) => ref)).toEqual([
      rootRef,
      replyRef,
    ])
    expect(providerRequests(driver, active)).toEqual(
      active.expectedSearchRequests,
    )

    active.resetRequests()
    const firstGet = await runOk(harness, active.env, [
      'get',
      replyRef,
      '--json',
    ])
    const getJson = JSON.parse(firstGet.stdout) as {
      resource: {
        ref: string
        sourceId: string
        origin: string
        hydratedAt: number
        payload: {
          bodyText: string
          conversationKey: string
          rfcMessageId: string
          inReplyTo: string
          attachments: Array<{
            ref: string
            filename: string
            mediaType: string
          }>
        }
      }
      warnings: unknown[]
    }
    expect(getJson).toMatchObject({
      resource: {
        ref: replyRef,
        sourceId,
        origin: 'adhoc',
        hydratedAt: expect.any(Number),
        payload: {
          bodyText: mailboxReplayFixture.body,
          conversationKey: `${sourceId}:${mailboxReplayFixture.conversationId}`,
          rfcMessageId: mailboxReplayFixture.replyMessageId,
          inReplyTo: mailboxReplayFixture.rootMessageId,
          attachments: [
            {
              ref: artifactRef,
              filename: active.attachmentFilename,
              mediaType: 'text/plain',
            },
          ],
        },
      },
      warnings: [],
    })
    expect(providerRequests(driver, active)).toEqual(
      active.expectedRetrieveRequests,
    )

    active.resetRequests()
    const secondGet = await runOk(harness, active.env, [
      'get',
      replyRef,
      '--json',
    ])
    expect(secondGet.stdout).toBe(firstGet.stdout)
    expect(providerRequests(driver, active)).toEqual([])

    const thread = await runOk(harness, active.env, [
      'thread',
      'get',
      replyRef,
      '--json',
    ])
    expect(flattenThreadRefs(JSON.parse(thread.stdout))).toEqual([
      rootRef,
      replyRef,
    ])
    expect(providerRequests(driver, active)).toEqual([])

    const firstOutput = join(stateDir, 'first-output.txt')
    active.resetRequests()
    const firstDownload = await runOk(harness, active.env, [
      'artifact',
      'download',
      artifactRef,
      '--output',
      firstOutput,
      '--json',
    ])
    expect(JSON.parse(firstDownload.stdout)).toMatchObject({ cache: 'miss' })
    expect(await readFile(firstOutput, 'utf8')).toBe(
      mailboxReplayFixture.attachmentText,
    )
    expect(providerRequests(driver, active)).toEqual(
      active.expectedDownloadRequests,
    )

    const secondOutput = join(stateDir, 'second-output.txt')
    active.resetRequests()
    const secondDownload = await runOk(harness, active.env, [
      'artifact',
      'download',
      artifactRef,
      '--output',
      secondOutput,
      '--json',
    ])
    expect(JSON.parse(secondDownload.stdout)).toMatchObject({ cache: 'hit' })
    expect(await readFile(secondOutput, 'utf8')).toBe(
      mailboxReplayFixture.attachmentText,
    )
    expect(providerRequests(driver, active)).toEqual([])

    const purged = await runOk(harness, active.env, [
      'purge',
      'artifacts',
      '--json',
    ])
    expect(JSON.parse(purged.stdout)).toMatchObject({
      artifactCountRemoved: 1,
      objectCountRemoved: 1,
    })
    const afterPurge = await runOk(harness, active.offlineEnv(), [
      'get',
      replyRef,
      '--json',
    ])
    expect(afterPurge.stdout).toBe(firstGet.stdout)
    const listed = await runOk(harness, active.offlineEnv(), [
      'artifact',
      'list',
      replyRef,
      '--json',
    ])
    expect(JSON.parse(listed.stdout)).toMatchObject({
      resourceRef: replyRef,
      artifacts: [{ ref: artifactRef }],
    })

    const thirdOutput = join(stateDir, 'third-output.txt')
    active.resetRequests()
    const thirdDownload = await runOk(harness, active.env, [
      'artifact',
      'download',
      artifactRef,
      '--output',
      thirdOutput,
      '--json',
    ])
    expect(JSON.parse(thirdDownload.stdout)).toMatchObject({ cache: 'miss' })
    expect(await readFile(thirdOutput, 'utf8')).toBe(
      mailboxReplayFixture.attachmentText,
    )
    expect(providerRequests(driver, active)).toEqual(
      active.expectedDownloadRequests,
    )

    active.resetRequests()
    const firstEml = await runOk(harness, active.offlineEnv(), [
      'export',
      replyRef,
      '--format',
      'eml',
    ])
    const secondEml = await runOk(harness, active.offlineEnv(), [
      'export',
      replyRef,
      '--format',
      'eml',
    ])
    expect(secondEml.stdout).toBe(firstEml.stdout)
    expect(firstEml.stdout).toContain(
      `Subject: ${mailboxReplayFixture.subject}`,
    )
    expect(firstEml.stdout).toContain(mailboxReplayFixture.body.trim())
    const firstJson = await runOk(harness, active.offlineEnv(), [
      'export',
      replyRef,
      '--format',
      'json',
    ])
    const secondJson = await runOk(harness, active.offlineEnv(), [
      'export',
      replyRef,
      '--format',
      'json',
    ])
    expect(secondJson.stdout).toBe(firstJson.stdout)
    expect(JSON.parse(firstJson.stdout)).toMatchObject({
      bodyText: mailboxReplayFixture.body,
      attachments: [{ ref: artifactRef }],
    })
    expect(providerRequests(driver, active)).toEqual([])

    const invalidCases = [
      ['get', 'not-a-ref', '--json'],
      [
        'get',
        `ctx://${foreignSourceId}/message/${mailboxReplayFixture.replyProviderId}`,
        '--json',
      ],
      ['artifact', 'download', 'not-a-ref', '--json'],
      [
        'artifact',
        'download',
        `ctx://${foreignSourceId}/message/${mailboxReplayFixture.replyProviderId}/attachment/foreign`,
        '--json',
      ],
    ] as const
    active.resetRequests()
    for (const args of invalidCases) {
      const invalid = await harness.run(args, active.env)
      expect(invalid.exitCode, `${args.join(' ')}\n${invalid.stderr}`).toBe(2)
    }
    expect(providerRequests(driver, active)).toEqual([])
  } finally {
    active?.stop()
    await rm(stateDir, { recursive: true, force: true })
  }
}
