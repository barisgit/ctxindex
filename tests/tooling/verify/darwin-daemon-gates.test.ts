import { expect, test } from 'bun:test'
import { accessSync, constants, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const scriptPath = join(repoRoot, 'scripts/verify/darwin-daemon-gates.sh')

const expectedGates = [
  ['Darwin lease unit suite', 'packages/local-daemon', 'src/lease.test.ts'],
  ['Daemon runtime lease suite', 'apps/daemon', 'src/runtime-lease.test.ts'],
  ['Compiled lease suite', 'apps/daemon', 'src/e2e/compiled-lease.e2e.test.ts'],
  [
    'Darwin compiled daemon journeys',
    'apps/daemon',
    'src/e2e/compiled-daemon.e2e.test.ts',
  ],
  [
    'Compiled Extension registry journeys',
    'apps/daemon',
    'src/e2e/compiled-extension-registry.e2e.test.ts',
  ],
  [
    'Compiled daemon ownership journey',
    'apps/daemon',
    'src/e2e/compiled-daemon-ownership.e2e.test.ts',
  ],
  [
    'Compiled Action and Artifact journey',
    'apps/cli',
    'src/e2e/compiled-daemon-action-artifact.e2e.test.ts',
  ],
  [
    'Compiled OAuth Account journey',
    'apps/cli',
    'src/e2e/compiled-oauth-account-lifecycle.e2e.test.ts',
  ],
  [
    'Compiled daemon idle exit journey',
    'apps/daemon',
    'src/e2e/compiled-idle-exit.e2e.test.ts',
  ],
  [
    'Compiled first-command sync journey',
    'apps/daemon',
    'src/e2e/compiled-first-command-sync.e2e.test.ts',
  ],
] as const

async function run(command: string[]) {
  const proc = Bun.spawn(command, {
    cwd: repoRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { exitCode, stdout, stderr }
}

function gateEntries(script: string): string[][] {
  const block = /readonly GATES=\(\n([\s\S]*?)\n\)/.exec(script)?.[1] ?? ''
  return block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('"'))
    .map((line) => line.slice(1, -1).split('|'))
}

test('the Darwin gate script is an executable, syntactically valid bash script', async () => {
  accessSync(scriptPath, constants.X_OK)
  const syntax = await run(['bash', '-n', scriptPath])
  expect(syntax.exitCode, syntax.stderr).toBe(0)
})

test('the Darwin gate script lists exactly the expected existing gates', async () => {
  const gates = gateEntries(await Bun.file(scriptPath).text())

  expect(
    gates.map(([label, directory, command]) => [
      label,
      directory,
      command?.split(' ').at(-1),
    ]),
  ).toEqual(expectedGates.map((gate) => [...gate]))
  for (const [, directory, testFile] of expectedGates) {
    expect(existsSync(join(repoRoot, directory, testFile))).toBe(true)
  }
})

test.skipIf(process.platform === 'darwin')(
  'the Darwin gate script refuses to run on other platforms',
  async () => {
    const result = await run(['bash', scriptPath])
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain('run this script on a Mac')
  },
)
