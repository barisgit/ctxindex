import { expect, test } from 'bun:test'
import { projectCommandReference } from '../../../apps/cli/src/command-model'
import { rootCommand } from '../../../apps/cli/src/main'

// Auditable map from every public command leaf, and every daemon ownership
// property, to the compiled multi-process journeys that prove it through
// relocated CLI and daemon executables. A new leaf fails here until a compiled
// journey invokes it. command-ownership.test.ts owns the daemon-versus-exception
// classification; this file only owns compiled coverage.

const ownership = 'apps/cli/src/e2e/compiled-daemon-ownership.e2e.test.ts'
const actionArtifact =
  'apps/cli/src/e2e/compiled-daemon-action-artifact.e2e.test.ts'
const oauthAccount =
  'apps/cli/src/e2e/compiled-oauth-account-lifecycle.e2e.test.ts'
const catalog = 'apps/cli/src/e2e/compiled-catalog.e2e.test.ts'
const directExtension = 'apps/cli/src/e2e/compiled-direct-extension.e2e.test.ts'
const docs = 'apps/cli/src/e2e/compiled-docs.e2e.test.ts'
const daemonJourneys = 'apps/daemon/src/e2e/compiled-daemon.e2e.test.ts'
const extensionRegistry =
  'apps/daemon/src/e2e/compiled-extension-registry.e2e.test.ts'

const compiledLeafJourneys: Readonly<Record<string, readonly string[]>> = {
  // Daemon-owned leaves.
  'account add': [oauthAccount, actionArtifact],
  'account list': [ownership, oauthAccount],
  'account remove': [ownership, oauthAccount],
  'oauth-app add': [ownership, oauthAccount],
  'oauth-app list': [ownership, oauthAccount],
  'oauth-app remove': [ownership],
  'docs list': [ownership, daemonJourneys],
  'docs get': [ownership, daemonJourneys],
  'docs search': [ownership],
  'action run': [actionArtifact, ownership],
  'artifact list': [ownership, actionArtifact],
  'artifact download': [actionArtifact, ownership],
  'artifact purge': [ownership, actionArtifact],
  'realm add': [ownership, daemonJourneys],
  'realm list': [ownership, daemonJourneys],
  'source add': [ownership, daemonJourneys],
  'source list': [ownership, daemonJourneys],
  'source remove': [ownership, daemonJourneys],
  sync: [ownership, daemonJourneys],
  get: [ownership, actionArtifact],
  export: [ownership, actionArtifact],
  thread: [ownership, daemonJourneys],
  search: [ownership, daemonJourneys],
  status: [ownership, daemonJourneys],
  'secrets status': [ownership, daemonJourneys],
  'secrets backend set': [ownership, daemonJourneys],
  describe: [ownership, actionArtifact],
  'extension list': [ownership, extensionRegistry],
  // Allowlisted exceptions.
  init: [ownership, daemonJourneys],
  'docs get-skill': [docs],
  'extension catalog build': [catalog],
  'extension catalog add': [catalog],
  'extension catalog list': [directExtension, extensionRegistry],
  'extension catalog show': [catalog],
  'extension catalog search': [catalog],
  'extension catalog refresh': [catalog],
  'extension catalog remove': [catalog],
  'extension install': [extensionRegistry, catalog, directExtension],
  'extension update': [extensionRegistry, directExtension],
  'extension uninstall': [extensionRegistry, catalog, directExtension],
  'daemon start': [ownership, daemonJourneys],
  'daemon status': [ownership, daemonJourneys],
  'daemon stop': [ownership, daemonJourneys],
}

const ownershipJourney =
  'compiled CLI keeps every stateful leaf on one daemon that alone can open the database'

// Each property names one compiled test by its exact title.
const compiledPropertyJourneys: Readonly<
  Record<string, readonly [file: string, title: string]>
> = {
  'one immutable daemon runtime across commands': [ownership, ownershipJourney],
  'no client SQLite open after ensure': [ownership, ownershipJourney],
  'stable output and exit codes': [ownership, ownershipJourney],
  'no live provider or network dependence': [ownership, ownershipJourney],
  'crash recovery without a direct fallback': [ownership, ownershipJourney],
  'no fallback to a direct route after daemon selection': [
    daemonJourneys,
    'metadata and override route separate CLI processes while a crashed daemon restarts without direct fallback',
  ],
  cancellation: [
    daemonJourneys,
    'SIGINT cancels a real local-directory sync without partial writes and leaves the daemon healthy',
  ],
  restart: [
    daemonJourneys,
    'background start survives its CLI, converges concurrently, stops idempotently, and recovers after SIGKILL',
  ],
  'deterministic foreground debug entry without a public serve command': [
    ownership,
    'the daemon executable runs in the foreground as the debug entry and stops on SIGTERM',
  ],
  'shutdown timeout retains ownership until shutdown completes': [
    daemonJourneys,
    'concurrent shutdown times out without releasing ownership, then force termination permits restart and backup',
  ],
}

function invokes(source: string, leaf: string): boolean {
  const tokens = leaf.split(' ').map((word) => `'${word}'`)
  return new RegExp(`\\[\\s*${tokens.join(',\\s*')}\\s*[,\\]]`).test(source)
}

async function compiledJourney(path: string): Promise<string> {
  const source = await Bun.file(path).text()
  // Only journeys over relocated compiled executables count as coverage.
  expect(
    source.includes('buildCompiledCliHarness(') ||
      source.includes("'--compile'"),
    path,
  ).toBe(true)
  return source
}

test('every public command leaf maps to a compiled journey that invokes it', async () => {
  const reference = await projectCommandReference(rootCommand)
  const leaves = reference.commands
    .filter(({ subCommands }) => subCommands.length === 0)
    .map(({ path }) => path.slice(1).join(' '))
    .sort()
  expect(Object.keys(compiledLeafJourneys).sort()).toEqual(leaves)

  const missing: string[] = []
  for (const [leaf, journeys] of Object.entries(compiledLeafJourneys)) {
    for (const path of journeys) {
      if (!invokes(await compiledJourney(path), leaf))
        missing.push(`${leaf} -> ${path}`)
    }
  }
  expect(missing).toEqual([])
})

test('every daemon ownership property names an existing compiled journey', async () => {
  for (const [property, [path, title]] of Object.entries(
    compiledPropertyJourneys,
  )) {
    expect((await compiledJourney(path)).includes(`'${title}'`), property).toBe(
      true,
    )
  }
})

test('leaf invocation matching requires the exact command tokens', () => {
  expect(invokes("run(['docs', 'get', 'x'])", 'docs get')).toBe(true)
  expect(invokes("run([\n  'sync',\n])", 'sync')).toBe(true)
  expect(invokes("run(['docs', 'get-skill'])", 'docs get')).toBe(false)
  expect(invokes("run(['status-x'])", 'status')).toBe(false)
})
