import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import {
  importPackageEntries,
  resolvePackageEntries,
} from '@ctxindex/core/extension'
import extension, {
  desktopApp,
  issueAdapter,
  issueProfile,
  projectProvider,
} from './extension'

describe('provider-backed issues Extension example', () => {
  test('exports one ordinary type-safe SDK graph from its manifest entry', async () => {
    expect(extension).toMatchObject({
      kind: 'extension',
      id: 'example.issues',
      oauthApps: [desktopApp],
      adapters: [issueAdapter],
    })
    expect(issueAdapter.provider).toBe(projectProvider)
    expect(issueAdapter.profiles).toEqual([issueProfile])
    expect(issueAdapter.access.scopes).toEqual(['issues.read'])
    expect(projectProvider.auth.baseScopes).toEqual(['openid', 'email'])

    const packageRoot = import.meta.dir
    const manifest = await Bun.file(resolve(packageRoot, 'package.json')).json()
    const resolved = await resolvePackageEntries(packageRoot, manifest, {
      origin: 'explicit-path',
    })
    const collected = await importPackageEntries(resolved)

    expect(collected.map(({ definition }) => definition.id)).toEqual([
      extension.id,
    ])
    expect(collected[0]?.documentation?.files.map(({ path }) => path)).toEqual([
      'README.md',
      'adapters/example.issues.md',
      'profiles/example.issue@1.md',
    ])
  })

  test('normalizes provider search output through the declared Profile', async () => {
    const requests: URL[] = []
    const fetchFixture = Object.assign(
      async (input: string | URL | Request): Promise<Response> => {
        requests.push(new URL(input instanceof Request ? input.url : input))
        return Response.json({
          items: [
            {
              id: 'I-42',
              title: 'Document the SDK',
              state: 'open',
              updatedAt: '2026-07-21T08:00:00.000Z',
            },
          ],
          continuation: 'next-page',
        })
      },
      { preconnect() {} },
    )

    const result = await issueAdapter.operations.searchRemote({
      source: { id: '01J00000000000000000000000', config: { project: 'sdk' } },
      query: { text: 'docs', limit: 10 },
      signal: new AbortController().signal,
      logger: {
        trace() {},
        debug() {},
        info() {},
        warn() {},
        error() {},
      },
      fetch: fetchFixture,
    })

    expect(requests[0]?.toString()).toBe(
      'https://api.example.invalid/projects/sdk/issues?q=docs&limit=10',
    )
    expect(result).toEqual({
      resources: [
        {
          ref: 'ctx://01J00000000000000000000000/issue/I-42',
          profile: { id: 'example.issue', version: 1 },
          title: 'Document the SDK',
          occurredAt: Date.parse('2026-07-21T08:00:00.000Z'),
          payload: {
            id: 'I-42',
            title: 'Document the SDK',
            state: 'open',
            updatedAt: '2026-07-21T08:00:00.000Z',
          },
        },
      ],
      warnings: [],
      continuation: 'next-page',
    })
  })
})
