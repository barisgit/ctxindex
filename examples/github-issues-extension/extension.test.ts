import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import {
  importPackageEntries,
  resolvePackageEntries,
} from '@ctxindex/core/extension'
import extension, {
  GITHUB_API_VERSION,
  GITHUB_ISSUES_MAX_ITEMS,
  GITHUB_ISSUES_MAX_PAGES,
  githubIssuesAdapter,
  githubPublicProvider,
  softwareIssueProfile,
} from './extension'
import { GITHUB_ISSUES_DEMO_WEBSITE_HANDOFF } from './website-handoff'

const sourceId = '01J00000000000000000000000'
const firstUrl =
  'https://api.github.com/repos/acme/widgets/issues?state=all&sort=updated&direction=desc&per_page=100'

function issue(number: number, overrides: Record<string, unknown> = {}) {
  return {
    number,
    title: `Issue ${number}`,
    body: `Body ${number}`,
    state: number % 2 === 0 ? 'closed' : 'open',
    labels: [{ name: 'bug' }, 'demo'],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: `2026-01-${String((number % 28) + 1).padStart(2, '0')}T00:00:00Z`,
    closed_at: number % 2 === 0 ? '2026-02-01T00:00:00Z' : null,
    html_url: `https://github.com/acme/widgets/issues/${number}`,
    user: { id: 99, login: 'not-retained' },
    assignees: [{ id: 100, login: 'not-retained' }],
    ...overrides,
  }
}

function nextLink(page: number, overrides = ''): string {
  return `<${firstUrl}&page=${page}${overrides}>; rel="next"`
}

function context(
  fetchImpl: typeof fetch,
  options: { cursor?: unknown; signal?: AbortSignal } = {},
) {
  const emissions: unknown[] = []
  return {
    emissions,
    value: {
      source: {
        id: sourceId,
        config: { owner: 'acme', repository: 'widgets' },
      },
      cursor: options.cursor ?? null,
      mode: 'sync' as const,
      signal: options.signal ?? new AbortController().signal,
      fetch: fetchImpl,
      logger: {
        trace() {},
        debug() {},
        info() {},
        warn() {},
        error() {},
      },
      emit(emission: unknown) {
        emissions.push(emission)
      },
    },
  }
}

function mockFetch(
  handler: (
    url: URL,
    init: RequestInit,
    call: number,
  ) => Response | Promise<Response>,
) {
  const requests: { url: URL; init: RequestInit }[] = []
  const fetchImpl = Object.assign(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      )
      requests.push({ url, init })
      return handler(url, init, requests.length)
    },
    { preconnect() {} },
  ) as typeof fetch
  return { fetchImpl, requests }
}

describe('GitHub Issues demo definitions', () => {
  test('exports one ordinary no-auth Provider-backed indexed graph', () => {
    expect(extension).toMatchObject({
      kind: 'extension',
      id: 'ctxindex.github-issues-demo',
      adapters: [githubIssuesAdapter],
    })
    expect(extension.oauthApps).toEqual([])
    expect(githubPublicProvider).toEqual({
      kind: 'provider',
      id: 'github.public',
      auth: { kind: 'none' },
    })
    expect(githubIssuesAdapter).toMatchObject({
      kind: 'adapter',
      id: 'github.issues',
      provider: githubPublicProvider,
      providerApiHosts: ['api.github.com'],
      profiles: [softwareIssueProfile],
      routing: 'indexed',
      capabilities: ['sync'],
      actions: {},
    })
    expect(softwareIssueProfile).toMatchObject({
      kind: 'profile',
      id: 'software.issue',
      version: 1,
    })
    expect(
      githubIssuesAdapter.configSchema.safeParse({
        owner: 'acme',
        repository: 'widgets',
      }).success,
    ).toBe(true)
    expect(
      githubIssuesAdapter.configSchema.safeParse({
        owner: 'acme',
        repository: 'widgets',
        token: 'forbidden',
      }).success,
    ).toBe(false)
  })

  test('is package-discoverable with a complete documentation sidecar', async () => {
    const manifest = await Bun.file(
      resolve(import.meta.dir, 'package.json'),
    ).json()
    const resolved = await resolvePackageEntries(import.meta.dir, manifest, {
      origin: 'explicit-path',
    })
    const collected = await importPackageEntries(resolved)
    expect(collected.map(({ definition }) => definition.id)).toEqual([
      'ctxindex.github-issues-demo',
    ])
    expect(collected[0]?.documentation?.files.map(({ path }) => path)).toEqual([
      'README.md',
      'adapters/github.issues.md',
      'guides/demo.md',
      'profiles/software.issue@1.md',
      'providers/github.public.md',
    ])
  })

  test('publishes exact launch-website handoff values without coupling to the website', () => {
    expect(GITHUB_ISSUES_DEMO_WEBSITE_HANDOFF).toEqual({
      extensionTarget: './examples/github-issues-extension',
      extensionId: 'ctxindex.github-issues-demo',
      providerId: 'github.public',
      adapterId: 'github.issues',
      profileId: 'software.issue',
      realm: 'demo',
      sourceLabel: 'ctxindex-issues',
      owner: 'barisgit',
      repository: 'ctxindex',
      fallbackOwner: 'octocat',
      fallbackRepository: 'Hello-World',
    })
  })
})

describe('GitHub Issues sync', () => {
  test('validates one page, sends recommended headers, and filters pull requests', async () => {
    const { fetchImpl, requests } = mockFetch(() =>
      Response.json(
        [
          issue(1),
          issue(2, { pull_request: { url: 'https://api.github.com/pr/2' } }),
        ],
        { headers: { etag: '"single-v1"' } },
      ),
    )
    const run = context(fetchImpl)
    await githubIssuesAdapter.operations.sync(run.value)

    expect(requests).toHaveLength(1)
    expect(requests[0]?.url.href).toBe(firstUrl)
    const headers = new Headers(requests[0]?.init.headers)
    expect(headers.get('accept')).toBe('application/vnd.github+json')
    expect(headers.get('user-agent')).toBe('ctxindex-github-issues-demo/1')
    expect(headers.get('x-github-api-version')).toBe(GITHUB_API_VERSION)
    expect(headers.get('if-none-match')).toBeNull()
    expect(requests[0]?.init.signal).toBe(run.value.signal)
    expect(run.emissions).toEqual([
      {
        type: 'upsertResource',
        resource: {
          ref: `ctx://${sourceId}/issue/1`,
          profile: { id: 'software.issue', version: 1 },
          completeness: 'complete',
          title: 'Issue 1',
          summary: 'Body 1',
          occurredAt: Date.parse('2026-01-02T00:00:00Z'),
          providerUpdatedAt: Date.parse('2026-01-02T00:00:00Z'),
          payload: {
            number: 1,
            title: 'Issue 1',
            body: 'Body 1',
            state: 'open',
            labels: ['bug', 'demo'],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            closedAt: null,
            url: 'https://github.com/acme/widgets/issues/1',
          },
        },
      },
      {
        type: 'checkpoint',
        cursor: {
          version: 1,
          issueNumbers: [1],
          pages: 1,
          etag: '"single-v1"',
        },
      },
    ])
    expect(JSON.stringify(run.emissions)).not.toContain('not-retained')
  })

  test('collects more than 100 issues before emitting and reconciles prior refs', async () => {
    const first = Array.from({ length: 100 }, (_, index) => issue(index + 1))
    const { fetchImpl, requests } = mockFetch((_url, _init, call) =>
      call === 1
        ? Response.json(first, {
            headers: { link: nextLink(2), etag: '"page-one"' },
          })
        : Response.json([issue(101)]),
    )
    const run = context(fetchImpl, {
      cursor: { version: 1, issueNumbers: [1, 999], pages: 1, etag: '"old"' },
    })
    await githubIssuesAdapter.operations.sync(run.value)

    expect(requests).toHaveLength(2)
    expect(new Headers(requests[0]?.init.headers).get('if-none-match')).toBe(
      '"old"',
    )
    expect(
      new Headers(requests[1]?.init.headers).get('if-none-match'),
    ).toBeNull()
    expect(run.emissions).toHaveLength(103)
    expect(run.emissions.at(-2)).toEqual({
      type: 'removeResource',
      ref: `ctx://${sourceId}/issue/999`,
    })
    expect(run.emissions.at(-1)).toEqual({
      type: 'checkpoint',
      cursor: {
        version: 1,
        issueNumbers: Array.from({ length: 101 }, (_, index) => index + 1),
        pages: 2,
      },
    })
  })

  test.each([
    [
      'alternate host',
      '<https://evil.example/repos/acme/widgets/issues?state=all&sort=updated&direction=desc&per_page=100&page=2>; rel="next"',
    ],
    [
      'alternate repository',
      '<https://api.github.com/repos/acme/other/issues?state=all&sort=updated&direction=desc&per_page=100&page=2>; rel="next"',
    ],
    ['mutated query', nextLink(2, '&state=open')],
    ['relative URL', '</repos/acme/widgets/issues?page=2>; rel="next"'],
    [
      'credentials',
      '<https://user:pass@api.github.com/repos/acme/widgets/issues?state=all&sort=updated&direction=desc&per_page=100&page=2>; rel="next"',
    ],
    ['fragment', `${nextLink(2).replace('>;', '#x>;')}`],
    ['malformed', `${firstUrl}&page=2; rel="next"`],
    ['ambiguous next', `${nextLink(2)}, ${nextLink(3)}`],
    ['non-exact next relation', `<${firstUrl}&page=2>; rel="prev next"`],
  ])('rejects %s pagination without emissions', async (_label, link) => {
    const { fetchImpl } = mockFetch(() =>
      Response.json([issue(1)], { headers: { link } }),
    )
    const run = context(fetchImpl)
    await expect(
      githubIssuesAdapter.operations.sync(run.value),
    ).rejects.toThrow()
    expect(run.emissions).toEqual([])
  })

  test('rejects a next-page loop and duplicate issue numbers atomically', async () => {
    const loop = mockFetch((_url, _init, call) =>
      Response.json([issue(call)], {
        headers: { link: nextLink(call === 1 ? 2 : 2) },
      }),
    )
    const loopRun = context(loop.fetchImpl)
    await expect(
      githubIssuesAdapter.operations.sync(loopRun.value),
    ).rejects.toThrow(/pagination/i)
    expect(loopRun.emissions).toEqual([])

    const duplicate = mockFetch((_url, _init, call) =>
      call === 1
        ? Response.json([issue(1)], { headers: { link: nextLink(2) } })
        : Response.json([issue(1)]),
    )
    const duplicateRun = context(duplicate.fetchImpl)
    await expect(
      githubIssuesAdapter.operations.sync(duplicateRun.value),
    ).rejects.toThrow(/duplicate/i)
    expect(duplicateRun.emissions).toEqual([])
  })

  test('reuses a one-page ETag for 304 without resource churn', async () => {
    const cursor = {
      version: 1,
      issueNumbers: [1, 2],
      pages: 1,
      etag: '"single-v1"',
    }
    const { fetchImpl, requests } = mockFetch(
      () => new Response(null, { status: 304 }),
    )
    const run = context(fetchImpl, { cursor })
    await githubIssuesAdapter.operations.sync(run.value)
    expect(new Headers(requests[0]?.init.headers).get('if-none-match')).toBe(
      '"single-v1"',
    )
    expect(run.emissions).toEqual([{ type: 'checkpoint', cursor }])
  })

  test('does not checkpoint when abort occurs while a 304 request is in flight', async () => {
    const controller = new AbortController()
    const cursor = {
      version: 1,
      issueNumbers: [1],
      pages: 1,
      etag: '"single-v1"',
    }
    const { fetchImpl, requests } = mockFetch(() => {
      controller.abort()
      return new Response(null, { status: 304 })
    })
    const run = context(fetchImpl, { cursor, signal: controller.signal })
    await expect(
      githubIssuesAdapter.operations.sync(run.value),
    ).rejects.toThrow()
    expect(requests).toHaveLength(1)
    expect(run.emissions).toEqual([])
  })

  test('does not reuse an ETag from a multi-page cursor', async () => {
    const { fetchImpl, requests } = mockFetch(() => Response.json([]))
    const run = context(fetchImpl, {
      cursor: {
        version: 1,
        issueNumbers: [1],
        pages: 2,
      },
    })
    await githubIssuesAdapter.operations.sync(run.value)
    expect(
      new Headers(requests[0]?.init.headers).get('if-none-match'),
    ).toBeNull()
    expect(run.emissions).toEqual([
      { type: 'removeResource', ref: `ctx://${sourceId}/issue/1` },
      {
        type: 'checkpoint',
        cursor: { version: 1, issueNumbers: [], pages: 1 },
      },
    ])

    const invalid = context(fetchImpl, {
      cursor: {
        version: 1,
        issueNumbers: [1],
        pages: 2,
        etag: '"invalid-multi-page-etag"',
      },
    })
    await expect(
      githubIssuesAdapter.operations.sync(invalid.value),
    ).rejects.toThrow(/cursor/i)
    expect(requests).toHaveLength(1)
    expect(invalid.emissions).toEqual([])
  })

  test('rejects a network failure without retry or emissions', async () => {
    const { fetchImpl, requests } = mockFetch(() => {
      throw new Error('offline')
    })
    const run = context(fetchImpl)
    await expect(
      githubIssuesAdapter.operations.sync(run.value),
    ).rejects.toThrow('offline')
    expect(requests).toHaveLength(1)
    expect(run.emissions).toEqual([])
  })

  test.each([403, 429])('does not retry HTTP %d', async (status) => {
    const { fetchImpl, requests } = mockFetch(() =>
      Response.json({ message: 'rate limited' }, { status }),
    )
    const run = context(fetchImpl)
    await expect(
      githubIssuesAdapter.operations.sync(run.value),
    ).rejects.toThrow(new RegExp(String(status)))
    expect(requests).toHaveLength(1)
    expect(run.emissions).toEqual([])
  })

  test('rejects abort, malformed payload, and later-page failure without emissions', async () => {
    const controller = new AbortController()
    controller.abort()
    const aborted = mockFetch(() => Response.json([]))
    const abortRun = context(aborted.fetchImpl, { signal: controller.signal })
    await expect(
      githubIssuesAdapter.operations.sync(abortRun.value),
    ).rejects.toThrow()
    expect(aborted.requests).toHaveLength(0)
    expect(abortRun.emissions).toEqual([])

    const malformed = mockFetch(() =>
      Response.json([issue(1, { number: 'one' })]),
    )
    const malformedRun = context(malformed.fetchImpl)
    await expect(
      githubIssuesAdapter.operations.sync(malformedRun.value),
    ).rejects.toThrow()
    expect(malformedRun.emissions).toEqual([])

    const partial = mockFetch((_url, _init, call) =>
      call === 1
        ? Response.json([issue(1)], { headers: { link: nextLink(2) } })
        : Response.json({ message: 'failure' }, { status: 500 }),
    )
    const partialRun = context(partial.fetchImpl)
    await expect(
      githubIssuesAdapter.operations.sync(partialRun.value),
    ).rejects.toThrow(/500/)
    expect(partialRun.emissions).toEqual([])
  })

  test('fails at the documented page bound before checkpoint', async () => {
    expect(GITHUB_ISSUES_MAX_PAGES).toBe(100)
    expect(GITHUB_ISSUES_MAX_ITEMS).toBe(10_000)
    const bounded = mockFetch((_url, _init, call) =>
      Response.json([issue(call)], {
        headers: { link: nextLink(call + 1) },
      }),
    )
    const run = context(bounded.fetchImpl)
    await expect(
      githubIssuesAdapter.operations.sync(run.value),
    ).rejects.toThrow(/limit/i)
    expect(bounded.requests).toHaveLength(100)
    expect(run.emissions).toEqual([])
  })

  test('fails at the documented item bound before checkpoint', async () => {
    const bounded = mockFetch(() =>
      Response.json(
        Array.from({ length: GITHUB_ISSUES_MAX_ITEMS + 1 }, (_, index) =>
          issue(index + 1),
        ),
      ),
    )
    const run = context(bounded.fetchImpl)
    await expect(
      githubIssuesAdapter.operations.sync(run.value),
    ).rejects.toThrow(/item limit/i)
    expect(bounded.requests).toHaveLength(1)
    expect(run.emissions).toEqual([])
  })
})
