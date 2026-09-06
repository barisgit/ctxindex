import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { defaultConfig } from '@ctxindex/core/config'
import { createDocumentationService } from '@ctxindex/core/documentation'
import { CtxindexAuthError } from '@ctxindex/core/errors'
import { loadExtensions } from '@ctxindex/core/extension'
import { describeRegistry } from '@ctxindex/core/registry'
import * as CTXINDEX_BUILTIN_MODULE from '@ctxindex/official'
import type { RpcExtensionListResult } from '@ctxindex/rpc'
import { projectCommandReference } from '../../../apps/cli/src/command-model'
import {
  CLI_DAEMON_PROTOCOL,
  daemonHealth,
  selectDaemon,
} from '../../../apps/cli/src/daemon/client'
import { ensureDaemonSelection } from '../../../apps/cli/src/daemon/ensure'
import { mapErrorToExit } from '../../../apps/cli/src/format/exit'
import {
  filterRegistryDescription,
  formatExtensions,
  formatRegistryMarkdown,
  formatRegistryText,
  registryJsonValue,
} from '../../../apps/cli/src/format/registry'
import { rootCommand, runCli } from '../../../apps/cli/src/main'
import { DaemonApplication } from '../../../apps/daemon/src/application'
import { ByteTransferStore } from '../../../apps/daemon/src/transfer'
import { bindDaemonTransport } from '../../../apps/daemon/src/transport'

let previous: NodeJS.ProcessEnv
let root: string

beforeEach(async () => {
  previous = { ...process.env }
  root = await mkdtemp('/tmp/ctxi-ownership-')
  for (const kind of ['CONFIG', 'DATA', 'STATE', 'CACHE']) {
    process.env[`CTXINDEX_${kind}_HOME`] = join(root, kind.toLowerCase())
  }
  process.env.NODE_ENV = 'test'
  process.env.CTXINDEX_KEYTAR_MOCK_FILE = join(root, 'keytar.json')
  delete process.env.CTXINDEX_DAEMON_TEST_ENDPOINT
  spyOn(console, 'log').mockImplementation(() => {})
  spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(async () => {
  process.exitCode = 0
  spyOn(console, 'log').mockRestore()
  spyOn(console, 'error').mockRestore()
  for (const key of Object.keys(process.env)) {
    if (!(key in previous)) delete process.env[key]
  }
  Object.assign(process.env, previous)
  await rm(root, { recursive: true, force: true })
})

async function selectMissingDaemon() {
  expect(await runCli(['init'])).toBe(0)
  process.env.CTXINDEX_DAEMON_TEST_ENDPOINT = join(root, 'missing.sock')
}

function expectDaemonUnavailable(
  exitCode: number,
  errors: readonly unknown[][],
) {
  expect(exitCode).toBe(50)
  expect([
    'The selected daemon test endpoint is unavailable.',
    'Extension command failed (daemon_unavailable)',
  ]).toContain(errors.flat().join('\n'))
}

async function expectUnavailableCommand(argv: string[]) {
  const error = spyOn(console, 'error')
  error.mockClear()
  expectDaemonUnavailable(await runCli(argv), error.mock.calls)
}

test('ownership assertion rejects a direct auth failure even when its exit is 50', () => {
  const failure = new CtxindexAuthError(
    'Missing OAuth App configuration',
    'missing_oauth_app_config',
  )
  const error = spyOn(console, 'error')
  error.mockClear()
  console.error(failure.message)
  const exitCode = mapErrorToExit(failure)
  expect(exitCode).toBe(50)
  expect(() => expectDaemonUnavailable(exitCode, error.mock.calls)).toThrow()
})

test('pure registry discovery remains available before initialization without durable state', async () => {
  expect(await runCli(['describe', '--format', 'json'])).toBe(0)
  expect(await runCli(['extension', 'list', '--format', 'json'])).toBe(0)
  expect(await readdir(root)).toEqual([])
  await expect(ensureDaemonSelection()).rejects.toMatchObject({
    code: 'invalid_args',
    message: 'ctxindex is not initialized; run ctxindex init',
  })
  expect(await readdir(root)).toEqual([])
})

test('control: selected endpoint is unavailable and Realm list fails closed', async () => {
  await selectMissingDaemon()
  const selection = selectDaemon()
  expect(selection?.selectedBy).toBe('test_override')
  if (!selection) throw new Error('Expected the selected test endpoint')
  await expect(daemonHealth(selection)).rejects.toMatchObject({
    code: 'daemon_unavailable',
  })
  await expectUnavailableCommand(['realm', 'list', '--format', 'json'])
})

for (const argv of [
  ['describe', '--format', 'json'],
  ['extension', 'list', '--format', 'json'],
]) {
  test(`initialized registry read must not bypass selected daemon: ${argv.join(' ')}`, async () => {
    await selectMissingDaemon()
    await expectUnavailableCommand(argv)
  })
}

async function registryDaemon(
  options: {
    builtins?: boolean
    diagnostics?: boolean
    installed?: RpcExtensionListResult['installed']
  } = {},
) {
  await selectMissingDaemon()
  const selection = selectDaemon()
  if (!selection) throw new Error('Expected selected daemon')
  const loaded = await loadExtensions({
    config: {
      ...defaultConfig(),
      extensions: {
        paths: [
          join(
            import.meta.dir,
            '../../../packages/core/src/extension/fixtures/valid-package',
          ),
          ...(options.diagnostics ? [join(root, 'missing-extension')] : []),
        ],
      },
    },
    builtins: options.builtins ? CTXINDEX_BUILTIN_MODULE : {},
  })
  const protocol = CLI_DAEMON_PROTOCOL
  const application = new DaemonApplication({
    protocol,
    runtime: selection.roots.identity,
    daemonVersion: '0.0.0',
    buildVersion: 'test',
    instanceId: 'registry-test',
    startedAt: '2026-07-18T00:00:00.000Z',
    pid: process.pid,
    extensionDiagnostics: loaded.diagnostics,
    extensionProvenance: loaded.provenance,
    installedExtensions: options.installed ?? [],
    documentationService: createDocumentationService([]),
    observationTimeoutMs: 25,
    registry: loaded.registry,
    syncService: {
      run: async () => ({ mode: 'sync', results: [], warnings: [] }),
    },
    sourceService: { resolveSourceId: (value) => value, getStatus: () => [] },
  })
  application.markReady()
  const listener = bindDaemonTransport({
    endpoint: selection.endpoint,
    application,
    expectations: { protocol, runtime: selection.roots.identity },
    transferStore: new ByteTransferStore(),
  })
  await daemonHealth(selection)
  return { application, listener, loaded }
}

test('describe reads the selected daemon registry rather than client builtins', async () => {
  const daemon = await registryDaemon()
  try {
    const log = spyOn(console, 'log')
    log.mockClear()
    const code = await runCli([
      'describe',
      'profile',
      'fixture.note',
      '--format',
      'json',
    ])
    expect({ code, errors: spyOn(console, 'error').mock.calls }).toEqual({
      code: 0,
      errors: [],
    })
    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toEqual({
      id: 'fixture.note',
      version: 1,
      fields: [],
      formats: [],
    })
    expect(
      await runCli(['describe', 'profile', 'missing', '--format', 'json']),
    ).toBe(2)
  } finally {
    await daemon.listener.stop()
  }
})

test('Extension inventory reads daemon identities and exact path provenance', async () => {
  const daemon = await registryDaemon()
  try {
    const log = spyOn(console, 'log')
    log.mockClear()
    expect(await runCli(['extension', 'list', '--format', 'json'])).toBe(0)
    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toEqual([
      {
        id: 'fixture.external',
        profiles: [{ id: 'fixture.note', version: 1 }],
        adapters: [],
        provenance: {
          id: 'fixture.external',
          kind: 'path',
          path: join(
            import.meta.dir,
            '../../../packages/core/src/extension/fixtures/valid-package',
          ),
        },
      },
    ])
  } finally {
    await daemon.listener.stop()
  }
})

const resourceRef = 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/message/one'
// Public invocations, not another RPC signature or a command-dispatch interface.
const daemonInvocations: Readonly<Record<string, readonly string[]>> = {
  'account add': ['google'],
  'account list': [],
  'account remove': ['fixture'],
  'oauth-app add': ['google', 'fixture', '--from-env'],
  'oauth-app list': [],
  'oauth-app remove': ['google', 'fixture'],
  'docs list': [],
  'docs get': ['fixture.md', '--extension', 'fixture.external'],
  'docs search': ['fixture'],
  'action run': ['fixture.action', '--source', 'fixture', '--input', '{}'],
  'artifact list': [resourceRef],
  'artifact download': [`${resourceRef}/attachment/file`],
  'artifact purge': [],
  'realm add': ['fixture'],
  'realm list': [],
  'source add': [
    'local.directory',
    '--realm',
    'fixture',
    '--config-json',
    '{}',
  ],
  'source list': [],
  'source remove': ['fixture'],
  sync: [],
  get: [resourceRef],
  export: [resourceRef, '--format', 'json'],
  thread: [resourceRef],
  search: ['fixture'],
  status: [],
  'secrets status': [],
  'secrets backend set': ['keychain'],
  describe: ['--format', 'json'],
  'extension list': ['--format', 'json'],
}

// These are narrowly classified surfaces, not an unconditional direct fallback.
// Pre-init describe/extension discovery and docs retain their separate tests;
// unsupported platforms retain the conditional shared route, never this list.
const exceptions = {
  init: 'pre-daemon bootstrap',
  'docs get-skill': 'embedded release content and explicit destination file',
  'extension catalog build':
    'trusted Catalog authoring, not installed activation',
  'extension catalog add': 'Catalog configuration and snapshots only',
  'extension catalog list': 'Catalog configuration and snapshots only',
  'extension catalog show': 'Catalog configuration and snapshots only',
  'extension catalog search': 'Catalog configuration and snapshots only',
  'extension catalog refresh': 'Catalog configuration and snapshots only',
  'extension catalog remove': 'Catalog configuration and snapshots only',
  'extension install': 'accepted stop/lease/mutate/release/restart coordinator',
  'extension update': 'accepted stop/lease/mutate/release/restart coordinator',
  'extension uninstall':
    'accepted stop/lease/mutate/release/restart coordinator',
  'daemon start': 'explicit lifecycle control',
  'daemon status': 'explicit lifecycle control',
  'daemon stop': 'explicit lifecycle control',
}

test('every actual public command leaf has exactly one ownership classification', async () => {
  const reference = await projectCommandReference(rootCommand)
  const actual = reference.commands
    .filter(({ subCommands }) => subCommands.length === 0)
    .map(({ path }) => path.slice(1).join(' '))
    .sort()
  const classified = [
    ...Object.keys(daemonInvocations),
    ...Object.keys(exceptions),
  ].sort()
  expect(classified.length).toBe(new Set(classified).size)
  expect(actual).toEqual(classified)
  expect(actual).toHaveLength(43)
  expect(await readdir(root)).toEqual([])
})

for (const [command, args] of Object.entries(daemonInvocations)) {
  test(`public ownership: ${command} cannot fall back after daemon selection`, async () => {
    await selectMissingDaemon()
    await expectUnavailableCommand([...command.split(' '), ...args])
  })
}

test('Source-aware Action description retains its selected daemon route', async () => {
  await selectMissingDaemon()
  await expectUnavailableCommand([
    'describe',
    'action',
    'fixture.action',
    '--source',
    'fixture',
  ])
})

test('dynamic Source configuration cannot bypass the selected daemon', async () => {
  await selectMissingDaemon()
  // Existing argument discovery rejects before runCli's exit boundary; ownership
  // still fails closed. Normalizing this pre-existing exit is a separate fix.
  await expect(
    runCli([
      'source',
      'add',
      'local.directory',
      '--realm',
      'fixture',
      '--config-path',
      root,
    ]),
  ).rejects.toMatchObject({ code: 'daemon_unavailable' })
})

test('daemon description preserves builtin OAuth declarations, every view, formatting, and safe diagnostics', async () => {
  const daemon = await registryDaemon({ builtins: true, diagnostics: true })
  try {
    const expected = describeRegistry(daemon.loaded.registry)
    for (const view of ['compact', 'detail', 'full'] as const) {
      for (const format of ['json', 'text', 'markdown'] as const) {
        const log = spyOn(console, 'log')
        const error = spyOn(console, 'error')
        log.mockClear()
        error.mockClear()
        const args =
          view === 'detail'
            ? ['adapter', 'local.directory']
            : view === 'full'
              ? ['--full']
              : []
        const projected =
          view === 'detail'
            ? filterRegistryDescription(expected, 'adapter', 'local.directory')
            : expected
        if (!projected)
          throw new Error('Expected the builtin Adapter projection')
        expect(await runCli(['describe', ...args, '--format', format])).toBe(0)
        const output = String(log.mock.calls.at(-1)?.[0])
        expect(output).toBe(
          format === 'json'
            ? JSON.stringify(
                registryJsonValue(
                  projected,
                  view === 'detail' ? 'adapter' : undefined,
                  view,
                ),
                null,
                2,
              )
            : format === 'text'
              ? formatRegistryText(projected, view)
              : formatRegistryMarkdown(projected, view),
        )
        expect(error.mock.calls).toEqual([
          [
            `Extension ${join(root, 'missing-extension')}: Extension package manifest could not be read`,
          ],
        ])
        expect(output).not.toContain('keytar.json')
      }
    }
  } finally {
    await daemon.listener.stop()
  }
})

test('daemon inventory preserves installed-but-unloaded entries, formatting and diagnostic exits', async () => {
  const installed = [
    {
      id: 'fixture.unloaded',
      sourceKind: 'local' as const,
      requestedTarget: '/extension/package',
      resolvedIdentity: '/extension/package',
      materializationDigest: 'a'.repeat(64),
      installedAt: 1,
      updatedAt: 2,
    },
  ]
  const daemon = await registryDaemon({ diagnostics: true, installed })
  try {
    for (const format of ['json', 'text'] as const) {
      const log = spyOn(console, 'log')
      log.mockClear()
      expect(await runCli(['extension', 'list', '--format', format])).toBe(0)
      expect(String(log.mock.calls.at(-1)?.[0])).toBe(
        formatExtensions(
          daemon.loaded.registry,
          format,
          daemon.loaded.provenance,
          installed,
        ),
      )
    }
  } finally {
    await daemon.listener.stop()
  }
})
