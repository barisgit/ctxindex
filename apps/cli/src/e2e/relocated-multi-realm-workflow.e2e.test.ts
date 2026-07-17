import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Sandbox } from '@ctxindex/core/testing'
import { type MockGmailMessage, startMockGmail } from './_mock-gmail'
import {
  type MockGoogleCalendarEvent,
  startMockGoogleCalendar,
} from './_mock-google-calendar'
import {
  type MockGraphCalendarEvent,
  type MockGraphMessage,
  startMockGraph,
} from './_mock-graph'
import { installLoopbackBrowser } from './_oauth-account'

const repoRoot = new URL('../../../../', import.meta.url).pathname
const createDraft = 'communication.message.draft.create'
const updateDraft = 'communication.message.draft.update'

function parseSourceId(stdout: string): string {
  const match = /^source added: (.+)$/m.exec(stdout)
  if (!match?.[1]) throw new Error(`Could not parse Source id from: ${stdout}`)
  return match[1]
}

function deterministicJson(stdout: string): unknown {
  const parsed = JSON.parse(stdout)
  expect(stdout.endsWith('\n')).toBe(true)
  const body = stdout.slice(0, -1)
  expect(body).toBe(
    body.includes('\n')
      ? JSON.stringify(parsed, null, 2)
      : JSON.stringify(parsed),
  )
  return parsed
}

const gmailMessages: readonly MockGmailMessage[] = [
  {
    id: 'gmail-root',
    threadId: 'gmail-thread',
    subject: 'Shared workflow root',
    body: 'Personal and work Gmail fixture body.',
    historyId: '3001',
    messageId: '<gmail-root@example.test>',
    date: 'Wed, 15 Jul 2026 09:00:00 +0000',
  },
  {
    id: 'gmail-reply',
    threadId: 'gmail-thread',
    subject: 'Re: Shared workflow root',
    body: 'Shared workflow Gmail reply.',
    historyId: '3002',
    messageId: '<gmail-reply@example.test>',
    inReplyTo: '<gmail-root@example.test>',
    date: 'Wed, 15 Jul 2026 10:00:00 +0000',
  },
]

const googleEvent: MockGoogleCalendarEvent = {
  id: 'google-event',
  status: 'confirmed',
  summary: 'Shared workflow Google event',
  description: 'Personal calendar fixture.',
  created: '2026-07-01T08:00:00Z',
  updated: '2026-07-02T09:00:00Z',
  start: { dateTime: '2026-07-20T09:00:00Z' },
  end: { dateTime: '2026-07-20T10:00:00Z' },
}

const graphEvent: MockGraphCalendarEvent = {
  id: 'microsoft-event',
  subject: 'Shared workflow Microsoft event',
  bodyPreview: 'Work calendar fixture.',
  body: { contentType: 'text', content: 'Work calendar fixture.' },
  start: { dateTime: '2026-07-20T09:00:00.000', timeZone: 'UTC' },
  end: { dateTime: '2026-07-20T10:00:00.000', timeZone: 'UTC' },
  originalStartTimeZone: 'UTC',
  originalEndTimeZone: 'UTC',
  isAllDay: false,
  isCancelled: false,
  showAs: 'busy',
  type: 'singleInstance',
  organizer: { emailAddress: { address: 'organizer@example.test' } },
  attendees: [],
  recurrence: null,
  createdDateTime: '2026-07-01T08:00:00Z',
  lastModifiedDateTime: '2026-07-02T09:00:00Z',
}

const graphMessages: readonly MockGraphMessage[] = [
  {
    id: 'outlook-root',
    conversationId: 'outlook-thread',
    internetMessageId: '<outlook-root@example.test>',
    subject: 'Shared workflow Outlook root',
    bodyPreview: 'Outlook root preview.',
    body: 'Outlook root body.',
    from: { address: 'sender@example.test' },
    to: [{ address: 'work@example.test' }],
    receivedDateTime: '2026-07-15T09:00:00Z',
    lastModifiedDateTime: '2026-07-15T09:05:00Z',
  },
  {
    id: 'outlook-reply',
    conversationId: 'outlook-thread',
    internetMessageId: '<outlook-reply@example.test>',
    inReplyTo: '<outlook-root@example.test>',
    subject: 'Re: Shared workflow Outlook root',
    bodyPreview: 'Outlook reply preview.',
    body: 'Complete shared workflow Outlook reply.',
    from: { address: 'work@example.test' },
    to: [{ address: 'sender@example.test' }],
    receivedDateTime: '2026-07-15T10:00:00Z',
    lastModifiedDateTime: '2026-07-15T10:05:00Z',
    attachments: [
      {
        id: 'attachment/1',
        name: 'workflow.txt',
        contentType: 'text/plain',
        bytes: new TextEncoder().encode('relocated attachment bytes\n'),
      },
    ],
  },
]

test('relocated compiled CLI runs the complete multi-Realm provider workflow', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ctxindex-relocated-workflow-'))
  const buildPath = join(dir, 'build', 'ctxindex')
  const relocatedPath = join(dir, 'relocated', 'ctxindex')
  const sandbox = { dir } as Sandbox
  const personalGmail = startMockGmail({
    identitySubject: 'google-personal-subject-canary',
    identityEmail: 'personal@example.test',
    accessToken: 'personal-access-token-canary',
    refreshToken: 'personal-refresh-token-canary',
    messages: gmailMessages,
  })
  const workGmail = startMockGmail({
    identitySubject: 'google-work-subject-canary',
    identityEmail: 'work-google@example.test',
    accessToken: 'work-access-token-canary',
    refreshToken: 'work-refresh-token-canary',
    authorizationTokens: {
      personal: 'personal-access-token-canary',
      work: 'work-access-token-canary',
    },
    messages: gmailMessages,
  })
  const googleCalendar = startMockGoogleCalendar({
    'personal@example.test': [googleEvent],
  })
  const graph = startMockGraph({
    messages: graphMessages,
    calendarEvents: { 'work/calendar': [graphEvent] },
    tokenScopes: 'Calendars.Read Mail.ReadWrite User.Read',
  })

  try {
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
    const [buildStdout, buildStderr, buildExitCode] = await Promise.all([
      new Response(build.stdout).text(),
      new Response(build.stderr).text(),
      build.exited,
    ])
    expect(buildExitCode, `${buildStdout}\n${buildStderr}`).toBe(0)
    await Bun.write(relocatedPath, Bun.file(buildPath))
    await chmod(relocatedPath, 0o755)
    await rm(join(dir, 'build'), { recursive: true })

    const bin = await installLoopbackBrowser(dir)
    const baseEnv = {
      ...graph.env(
        sandbox,
        googleCalendar.env(
          sandbox,
          workGmail.env(sandbox, {
            XDG_CONFIG_HOME: join(dir, 'config'),
            XDG_DATA_HOME: join(dir, 'data'),
            XDG_STATE_HOME: join(dir, 'state'),
            XDG_CACHE_HOME: join(dir, 'cache'),
            CTXINDEX_GOOGLE_CLIENT_SECRET: 'client-secret-canary',
          }),
        ),
      ),
      CTXINDEX_OAUTH_MOCK_BASE_URL: graph.baseUrl,
      CTXINDEX_LOOPBACK_TIMEOUT_SECS: '5',
      PATH: `${bin}:${process.env.PATH ?? ''}`,
    }
    const run = async (
      args: string[],
      env: Record<string, string | undefined> = baseEnv,
    ) => {
      const child = Bun.spawn([relocatedPath, ...args], {
        cwd: '/',
        env: { ...process.env, ...env },
        stdin: null,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ])
      return { stdout, stderr, exitCode }
    }
    const ok = async (
      args: string[],
      env: Record<string, string | undefined> = baseEnv,
    ) => {
      const result = await run(args, env)
      expect(result.exitCode, `${args.join(' ')}\n${result.stderr}`).toBe(0)
      return result
    }

    await ok(['init'])
    await ok(['realm', 'add', 'personal'])
    await ok(['realm', 'add', 'work'])
    await ok(['realm', 'add', 'files'])

    await ok(['client', 'add', 'google', '--from-env'])
    await ok(['client', 'add', 'microsoft', '--from-env'])
    await ok(['account', 'add', 'google', '--label', 'personal'], {
      ...baseEnv,
      ...personalGmail.env(sandbox),
      CTXINDEX_GOOGLE_CALENDAR_MOCK_BASE_URL: googleCalendar.baseUrl,
    })
    await ok(['account', 'add', 'google', '--label', 'work'], {
      ...baseEnv,
      ...workGmail.env(sandbox),
      CTXINDEX_GOOGLE_CALENDAR_MOCK_BASE_URL: googleCalendar.baseUrl,
    })
    await ok(
      ['account', 'add', 'microsoft', '--label', 'microsoft-work'],
      baseEnv,
    )

    const dataPath = join(dir, 'data', 'ctxindex', 'ctxindex.sqlite')
    const database = new Database(dataPath, { readonly: true })
    const grants = database
      .query(
        `SELECT a.provider, a.external_user_id, g.scopes_json
         FROM grants g JOIN accounts a ON a.id = g.account_id
         ORDER BY a.provider, a.external_user_id`,
      )
      .all() as {
      provider: string
      external_user_id: string
      scopes_json: string
    }[]
    database.close()
    expect(grants).toHaveLength(3)
    expect(grants.map(({ external_user_id }) => external_user_id)).toEqual([
      'google-personal-subject-canary',
      'google-work-subject-canary',
      'microsoft-work-subject',
    ])
    expect(grants.map(({ scopes_json }) => JSON.parse(scopes_json))).toEqual([
      [
        'email',
        'https://www.googleapis.com/auth/calendar.events.readonly',
        'https://www.googleapis.com/auth/gmail.compose',
        'https://www.googleapis.com/auth/gmail.readonly',
        'openid',
      ],
      [
        'email',
        'https://www.googleapis.com/auth/calendar.events.readonly',
        'https://www.googleapis.com/auth/gmail.compose',
        'https://www.googleapis.com/auth/gmail.readonly',
        'openid',
      ],
      ['Calendars.Read', 'Mail.ReadWrite', 'User.Read'],
    ])

    const addSource = async (args: string[]) =>
      parseSourceId((await ok(['source', 'add', ...args])).stdout)
    const personalMailLabel = 'personal-mail'
    const personalMail = await addSource([
      'google.mailbox',
      '--realm',
      'personal',
      '--account',
      'personal',
      '--label',
      personalMailLabel,
    ])
    const personalCalendarLabel = 'personal-calendar'
    const personalCalendar = await addSource([
      'google.calendar',
      '--realm',
      'personal',
      '--account',
      'personal',
      '--label',
      personalCalendarLabel,
      '--config-calendar-id',
      'personal@example.test',
    ])
    const workGmailLabel = 'work-gmail'
    const workGmailSource = await addSource([
      'google.mailbox',
      '--realm',
      'work',
      '--account',
      'work',
      '--label',
      workGmailLabel,
    ])
    const workOutlookLabel = 'work-outlook'
    const workOutlook = await addSource([
      'microsoft.mailbox',
      '--realm',
      'work',
      '--account',
      'microsoft-work',
      '--label',
      workOutlookLabel,
    ])
    const workCalendarLabel = 'work-calendar'
    const workCalendar = await addSource([
      'microsoft.calendar',
      '--realm',
      'work',
      '--account',
      'microsoft-work',
      '--label',
      workCalendarLabel,
      '--config-calendar-id',
      'work/calendar',
    ])
    const fixtureRoot = join(dir, 'fixture')
    await mkdir(fixtureRoot)
    await writeFile(
      join(fixtureRoot, 'workflow.txt'),
      'Shared workflow local file fixture.\n',
    )
    const localSourceLabel = 'local-fixture'
    const localSource = await addSource([
      'local.directory',
      '--realm',
      'files',
      '--label',
      localSourceLabel,
      '--config-root-path',
      fixtureRoot,
    ])

    const accountsResult = await ok(['account', 'list', '--json'])
    expect((await ok(['account', 'list', '--json'])).stdout).toBe(
      accountsResult.stdout,
    )
    const accounts = deterministicJson(accountsResult.stdout) as {
      provider: string
      label: string
      grants: {
        scopes: string[]
      }[]
    }[]
    expect(accounts).toHaveLength(3)
    expect(accounts.map(({ label }) => label)).toEqual([
      'personal',
      'work',
      'microsoft-work',
    ])
    expect(accounts.flatMap(({ grants: nested }) => nested)).toHaveLength(3)
    expect(
      accounts.flatMap(({ grants: nested }) =>
        nested.map(({ scopes }) => scopes),
      ),
    ).toEqual(grants.map(({ scopes_json }) => JSON.parse(scopes_json)))
    for (const canary of [
      'google-personal-subject-canary',
      'google-work-subject-canary',
      'microsoft-work-subject',
      'access-token-canary',
      'refresh-token-canary',
      'client-secret-canary',
    ]) {
      expect(accountsResult.stdout).not.toContain(canary)
    }

    const sourcesResult = await ok(['source', 'list', '--json'])
    expect((await ok(['source', 'list', '--json'])).stdout).toBe(
      sourcesResult.stdout,
    )
    const sources = deterministicJson(sourcesResult.stdout) as {
      id: string
      label: string
      grantId: string | null
      realmSlug: string
    }[]
    expect(sources).toHaveLength(6)
    expect(new Set(sources.map(({ id }) => id))).toEqual(
      new Set([
        personalMail,
        personalCalendar,
        workGmailSource,
        workOutlook,
        workCalendar,
        localSource,
      ]),
    )
    expect(new Set(sources.map(({ label }) => label))).toEqual(
      new Set([
        personalMailLabel,
        personalCalendarLabel,
        workGmailLabel,
        workOutlookLabel,
        workCalendarLabel,
        localSourceLabel,
      ]),
    )
    expect(sources.find(({ id }) => id === localSource)?.grantId).toBeNull()

    for (const source of [
      personalCalendarLabel,
      workCalendarLabel,
      localSourceLabel,
    ]) {
      deterministicJson(
        (await ok(['sync', '--source', source, '--json'])).stdout,
      )
    }

    const remoteSearch = deterministicJson(
      (await ok(['search', 'Shared workflow', '--remote', '--json'])).stdout,
    ) as { results: { sourceId: string; ref: string }[] }
    expect(
      new Set(remoteSearch.results.map(({ sourceId }) => sourceId)),
    ).toEqual(new Set([personalMail, workGmailSource, workOutlook]))
    const indexedSearchResult = await ok([
      'search',
      'Shared workflow',
      '--json',
    ])
    expect((await ok(['search', 'Shared workflow', '--json'])).stdout).toBe(
      indexedSearchResult.stdout,
    )
    const indexedSearch = deterministicJson(indexedSearchResult.stdout) as {
      results: { sourceId: string }[]
    }
    expect(
      new Set(indexedSearch.results.map(({ sourceId }) => sourceId)),
    ).toEqual(
      new Set([
        personalMail,
        personalCalendar,
        workGmailSource,
        workOutlook,
        workCalendar,
        localSource,
      ]),
    )
    for (const [realm, expectedRemote, expectedIndexed] of [
      ['personal', [personalMail], [personalMail, personalCalendar]],
      [
        'work',
        [workGmailSource, workOutlook],
        [workGmailSource, workOutlook, workCalendar],
      ],
    ] as const) {
      const remote = deterministicJson(
        (
          await ok([
            'search',
            'Shared workflow',
            '--remote',
            '--realm',
            realm,
            '--json',
          ])
        ).stdout,
      ) as { results: { sourceId: string }[] }
      expect(new Set(remote.results.map(({ sourceId }) => sourceId))).toEqual(
        new Set(expectedRemote),
      )
      const indexed = deterministicJson(
        (await ok(['search', 'Shared workflow', '--realm', realm, '--json']))
          .stdout,
      ) as { results: { sourceId: string }[] }
      expect(new Set(indexed.results.map(({ sourceId }) => sourceId))).toEqual(
        new Set(expectedIndexed),
      )
    }
    const filesSearch = deterministicJson(
      (await ok(['search', 'Shared workflow', '--realm', 'files', '--json']))
        .stdout,
    ) as { results: { sourceId: string }[] }
    expect(filesSearch.results.map(({ sourceId }) => sourceId)).toEqual([
      localSource,
    ])

    const gmailRef = `ctx://${personalMail}/message/gmail-reply`
    const outlookRef = `ctx://${workOutlook}/message/outlook-reply`
    const googleEventRef = `ctx://${personalCalendar}/event/google-event`
    const microsoftEventRef = `ctx://${workCalendar}/event/microsoft-event`
    const localRef = `ctx://${localSource}/file/workflow.txt`
    for (const [ref, match] of [
      [gmailRef, { providerMessageId: 'gmail-reply' }],
      [outlookRef, { providerMessageId: 'outlook-reply' }],
      [googleEventRef, { providerEventId: 'google-event' }],
      [microsoftEventRef, { providerEventId: 'microsoft-event' }],
      [localRef, { path: 'workflow.txt' }],
    ] as const) {
      const got = deterministicJson(
        (await ok(['get', ref, '--json'])).stdout,
      ) as {
        resource: { payload: Record<string, unknown> }
      }
      expect(got.resource.payload).toMatchObject(match)
    }

    for (const [ref, ids] of [
      [gmailRef, ['gmail-root', 'gmail-reply']],
      [outlookRef, ['outlook-root', 'outlook-reply']],
    ] as const) {
      const thread = await ok(['thread', 'get', ref, '--json'])
      deterministicJson(thread.stdout)
      for (const id of ids) expect(thread.stdout).toContain(`/message/${id}`)
    }

    const graphRequestsBeforeArtifact = graph.readRequests().length
    const outlook = deterministicJson(
      (await ok(['get', outlookRef, '--json'])).stdout,
    ) as {
      resource: { payload: { attachments: { ref: string }[] } }
    }
    expect(graph.readRequests()).toHaveLength(graphRequestsBeforeArtifact)
    const artifactRef = outlook.resource.payload.attachments[0]?.ref ?? ''
    const firstOutput = join(dir, 'attachment-first.txt')
    await ok([
      'artifact',
      'download',
      artifactRef,
      '--output',
      firstOutput,
      '--json',
    ])
    const attachmentFetches = graph
      .readRequests()
      .filter(({ pathname }) => pathname.endsWith('/$value')).length
    const secondOutput = join(dir, 'attachment-second.txt')
    await ok([
      'artifact',
      'download',
      artifactRef,
      '--output',
      secondOutput,
      '--json',
    ])
    expect(await readFile(firstOutput, 'utf8')).toBe(
      'relocated attachment bytes\n',
    )
    expect(await readFile(secondOutput, 'utf8')).toBe(
      'relocated attachment bytes\n',
    )
    expect(
      graph
        .readRequests()
        .filter(({ pathname }) => pathname.endsWith('/$value')),
    ).toHaveLength(attachmentFetches)

    const providerRequestsBeforeExports =
      personalGmail.readRequests().length +
      workGmail.readRequests().length +
      graph.readRequests().length
    const gmailExport = await ok(['export', gmailRef, '--format', 'json'])
    expect(JSON.parse(gmailExport.stdout)).toMatchObject({
      providerMessageId: 'gmail-reply',
    })
    const outlookExport = await ok(['export', outlookRef, '--format', 'eml'])
    expect(outlookExport.stdout).toContain(
      'Complete shared workflow Outlook reply.',
    )
    expect(
      personalGmail.readRequests().length +
        workGmail.readRequests().length +
        graph.readRequests().length,
    ).toBe(providerRequestsBeforeExports)

    const calendarRequests = [
      ...googleCalendar.readRequests(),
      ...graph
        .readRequests()
        .filter(({ pathname }) => pathname.includes('calendar')),
    ]
    expect(
      new Set(
        workGmail
          .readRecordedRequests()
          .filter(({ pathname }) => pathname.startsWith('/gmail/'))
          .map(({ credentialLabel }) => credentialLabel),
      ),
    ).toEqual(new Set(['personal', 'work']))

    personalGmail.resetRequests()
    workGmail.resetRequests()
    graph.resetRequests()
    const malformed = await run([
      'action',
      'run',
      createDraft,
      '--source',
      workOutlookLabel,
      '--input',
      '{not-json',
      '--json',
    ])
    expect(malformed.exitCode).toBe(2)
    const injected = await run([
      'action',
      'run',
      createDraft,
      '--source',
      personalMailLabel,
      '--input',
      JSON.stringify({
        to: ['victim@example.test\r\nBcc: injected@example.test'],
        subject: 'Invalid',
        bodyText: 'Must not persist',
      }),
      '--json',
    ])
    expect(injected.exitCode).toBe(2)
    expect(workGmail.readRecordedRequests()).toEqual([])
    expect(graph.readRequests()).toEqual([])

    const runDraftPair = async (
      source: string,
      provider: 'gmail' | 'outlook',
    ) => {
      const created = deterministicJson(
        (
          await ok([
            'action',
            'run',
            createDraft,
            '--source',
            source,
            '--input',
            JSON.stringify({
              to: ['recipient@example.test'],
              subject: `${provider} original`,
              bodyText: `${provider} original body`,
            }),
            '--json',
          ])
        ).stdout,
      ) as { resource: { ref: string } }
      const updated = deterministicJson(
        (
          await ok([
            'action',
            'run',
            updateDraft,
            '--source',
            source,
            '--input',
            JSON.stringify({
              ref: created.resource.ref,
              to: ['replacement@example.test'],
              subject: `${provider} replacement`,
              bodyText: `${provider} replacement body`,
            }),
            '--json',
          ])
        ).stdout,
      ) as {
        resource: {
          ref: string
          payload: {
            to: string[]
            cc: string[]
            bcc: string[]
            subject: string
            bodyText: string
          }
        }
      }
      expect(updated.resource.ref).toBe(created.resource.ref)
      expect(updated.resource.payload).toMatchObject({
        to: ['replacement@example.test'],
        cc: [],
        bcc: [],
        subject: `${provider} replacement`,
        bodyText: `${provider} replacement body`,
      })
    }
    await runDraftPair(personalMailLabel, 'gmail')
    await runDraftPair(workOutlookLabel, 'outlook')

    const requestsBeforeUnknown =
      workGmail.readRecordedRequests().length + graph.readRequests().length
    const unknown = await run([
      'action',
      'run',
      'communication.message.draft.send',
      '--source',
      workOutlookLabel,
      '--input',
      '{}',
      '--json',
    ])
    expect(unknown.exitCode).toBe(2)
    expect(
      workGmail.readRecordedRequests().length + graph.readRequests().length,
    ).toBe(requestsBeforeUnknown)
    const gmailMutations = workGmail
      .readRecordedRequests()
      .filter(({ method }) => method === 'POST' || method === 'PUT')
    expect(gmailMutations.map(({ method }) => method)).toEqual(['POST', 'PUT'])
    expect(
      gmailMutations.map(({ credentialLabel }) => credentialLabel),
    ).toEqual(['personal', 'personal'])
    const graphMutations = graph
      .readRequests()
      .filter(({ method }) => method === 'POST' || method === 'PATCH')
    expect(graphMutations.map(({ method }) => method)).toEqual([
      'POST',
      'PATCH',
    ])
    expect(
      [...workGmail.readRequests(), ...graph.readRequests()].some(
        ({ pathname }) => pathname.includes('/send'),
      ),
    ).toBe(false)

    expect(calendarRequests.every(({ method }) => method === 'GET')).toBe(true)
    expect(
      grants.flatMap(({ scopes_json }) => JSON.parse(scopes_json)),
    ).not.toContain('Mail.Send')
  } finally {
    personalGmail.stop()
    workGmail.stop()
    googleCalendar.stop()
    graph.stop()
    await rm(dir, { recursive: true, force: true })
  }
}, 120_000)
