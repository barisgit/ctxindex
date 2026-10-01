import { expect, test } from 'bun:test'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildCompiledCliHarness } from './_compiled-cli-harness'
import { installLoopbackBrowser } from './_oauth-account'

// Loopback-only lifecycle journey through the compiled CLI and the daemon it
// starts: OAuth App add from the environment, Account authorization through
// the daemon-owned loopback listener, inventory, re-authorization under a new
// label, and removal. Every output and every non-secret-store file is scanned
// for the synthetic credentials.

const clientSecret = 'client-secret-canary-5d1e'
const accessToken = 'access-token-canary-2b7c'
const refreshToken = 'refresh-token-canary-9a4f'
const canaries = [clientSecret, accessToken, refreshToken]
const invalidConfig =
  'OAuth App configuration is invalid for the selected Provider'

function startMockOAuth() {
  const calls: string[] = []
  const server = createServer((request, response) => {
    calls.push(request.url ?? '')
    response.setHeader('content-type', 'application/json')
    if (request.url === '/oauth/google/token') {
      response.end(
        JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 3600,
        }),
      )
      return
    }
    if (request.url === '/oauth/google/identity') {
      response.end(
        JSON.stringify({
          sub: 'lifecycle-subject',
          email: 'lifecycle@example.test',
          email_verified: true,
        }),
      )
      return
    }
    response.writeHead(404)
    response.end()
  })
  return { server, calls }
}

// Files that intentionally hold secret material: the mock keychain and the
// encrypted file backend with its key.
const secretStores = ['keytar.json', 'secrets.box', 'secret.key']

async function filesContainingCanaries(root: string): Promise<string[]> {
  const matches: string[] = []
  for (const entry of await readdir(root, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile() || secretStores.includes(entry.name)) continue
    const path = join(entry.parentPath, entry.name)
    const content = await readFile(path).catch(() => undefined)
    if (content && canaries.some((canary) => content.includes(canary))) {
      matches.push(path)
    }
  }
  return matches
}

test('compiled CLI drives the OAuth App and Account lifecycle through the daemon', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ctxindex-oauth-lifecycle-'))
  const harness = await buildCompiledCliHarness()
  const oauth = startMockOAuth()
  await new Promise<void>((resolve) =>
    oauth.server.listen(0, '127.0.0.1', resolve),
  )
  const base = `http://127.0.0.1:${(oauth.server.address() as AddressInfo).port}`
  const bin = await installLoopbackBrowser(dir)
  const keytarFile = join(dir, 'keytar.json')
  // A fully isolated environment: no inherited roots, HOME, or credentials.
  const env: Record<string, string> = {
    HOME: dir,
    PATH: `${bin}:${process.env.PATH ?? ''}`,
    NODE_ENV: 'test',
    XDG_CONFIG_HOME: join(dir, 'config'),
    XDG_DATA_HOME: join(dir, 'data'),
    XDG_STATE_HOME: join(dir, 'state'),
    XDG_CACHE_HOME: join(dir, 'cache'),
    CTXINDEX_KEYTAR_MOCK_FILE: keytarFile,
    CTXINDEX_OAUTH_MOCK_BASE_URL: base,
    CTXINDEX_LOOPBACK_TIMEOUT_SECS: '10',
  }
  const printed: string[] = []
  const run = async (args: string[], extra: Record<string, string> = {}) => {
    const result = await harness.run(args, { ...env, ...extra })
    printed.push(result.stdout, result.stderr)
    return result
  }
  const ok = async (args: string[], extra: Record<string, string> = {}) => {
    const result = await run(args, extra)
    expect(result.exitCode, `${args.join(' ')}\n${result.stderr}`).toBe(0)
    return result
  }
  const instance = async () =>
    /instance=(\S+)/.exec((await ok(['daemon', 'status'])).stdout)?.[1]
  const accounts = async () =>
    JSON.parse((await ok(['account', 'list', '--format', 'json'])).stdout) as {
      id: string
      label: string
    }[]

  const localApps = async () =>
    (
      JSON.parse(
        (await ok(['oauth-app', 'list', '--format', 'json'])).stdout,
      ) as {
        origin: string
      }[]
    ).filter(({ origin }) => origin === 'local')

  try {
    await ok(['init'])
    await ok(['daemon', 'start'])
    const daemonInstance = await instance()
    expect(daemonInstance).toBeString()

    // Malformed sensitive input fails as validation and stores nothing.
    const malformed = await run(
      ['oauth-app', 'add', 'google', 'desktop', '--from-env'],
      {
        CTXINDEX_GOOGLE_CLIENT_ID: 'public-client-id',
        CTXINDEX_GOOGLE_CLIENT_SECRET: `${clientSecret}\u0007`,
      },
    )
    expect(malformed.exitCode).toBe(2)
    expect(malformed.stderr.trim()).toBe(invalidConfig)
    expect(await localApps()).toEqual([])
    expect(await readFile(keytarFile, 'utf8').catch(() => '')).not.toContain(
      clientSecret,
    )

    await ok(['oauth-app', 'add', 'google', 'desktop', '--from-env'], {
      CTXINDEX_GOOGLE_CLIENT_ID: 'public-client-id',
      CTXINDEX_GOOGLE_CLIENT_SECRET: clientSecret,
    })
    expect(await localApps()).toMatchObject([
      { providerId: 'google', label: 'desktop' },
    ])

    // The daemon-owned loopback listener receives the browser callback.
    const added = await ok([
      'account',
      'add',
      'google',
      '--app',
      'desktop',
      '--label',
      'work',
    ])
    expect(added.stdout).toContain('Open this URL: ')
    const [first] = await accounts()
    expect(await accounts()).toEqual([
      expect.objectContaining({ label: 'work' }),
    ])

    // Re-authorizing the same identity under a new label renames the Account.
    await ok([
      'account',
      'add',
      'google',
      '--app',
      'desktop',
      '--label',
      'personal',
    ])
    expect(await accounts()).toEqual([
      expect.objectContaining({ id: first?.id, label: 'personal' }),
    ])

    expect((await ok(['account', 'remove', 'personal'])).stdout).toContain(
      'account removed: "personal"',
    )
    expect(await accounts()).toEqual([])

    expect(oauth.calls).toEqual([
      '/oauth/google/token',
      '/oauth/google/identity',
      '/oauth/google/token',
      '/oauth/google/identity',
    ])
    // One daemon owned the whole journey.
    expect(await instance()).toBe(daemonInstance)
    for (const canary of canaries) {
      expect(printed.join('\n')).not.toContain(canary)
    }
    expect(await filesContainingCanaries(dir)).toEqual([])
  } finally {
    await harness.run(['daemon', 'stop'], env).catch(() => undefined)
    await harness.cleanup()
    oauth.server.close()
    await rm(dir, { recursive: true, force: true })
  }
}, 120_000)
