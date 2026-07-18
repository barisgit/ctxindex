import { afterEach, expect, test } from 'bun:test'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const lintStagedPath = join(
  repoRoot,
  'node_modules/lint-staged/bin/lint-staged.js',
)
const configPath = join(repoRoot, '.lintstagedrc.cjs')
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

async function run(command: string[], cwd: string): Promise<void> {
  const proc = Bun.spawn(command, {
    cwd,
    stdin: null,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  if (exitCode !== 0) {
    throw new Error(
      `${command.join(' ')} failed (${exitCode})\n${stdout}${stderr}`,
    )
  }
}

test('staged TypeScript is formatted before typechecking', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-lint-staged-'))
  tempDirs.push(root)

  const binDir = join(root, 'node_modules/.bin')
  const orderLog = join(root, 'order.log')
  await mkdir(binDir, { recursive: true })
  await writeFile(join(root, 'example.ts'), 'const value=1\n')
  await writeFile(join(root, '.lintstagedrc.cjs'), await readFile(configPath))
  await writeFile(
    join(binDir, 'biome'),
    `#!/bin/sh
printf 'biome:start\\n' >> "$ORDER_LOG"
sleep 0.3
printf 'biome:end\\n' >> "$ORDER_LOG"
`,
  )
  await writeFile(
    join(binDir, 'bun'),
    `#!/bin/sh
i=0
while [ "$i" -lt 100 ] && ! { [ -f "$ORDER_LOG" ] && grep -q '^biome:start$' "$ORDER_LOG"; }; do
  sleep 0.01
  i=$((i + 1))
done
if grep -q '^biome:end$' "$ORDER_LOG"; then
  printf 'typecheck:after\\n' >> "$ORDER_LOG"
else
  printf 'typecheck:before\\n' >> "$ORDER_LOG"
fi
`,
  )
  await Promise.all([
    chmod(join(binDir, 'biome'), 0o755),
    chmod(join(binDir, 'bun'), 0o755),
  ])

  await run(['git', 'init', '--quiet'], root)
  await run(['git', 'add', 'example.ts'], root)

  const proc = Bun.spawn(
    [
      process.execPath,
      lintStagedPath,
      '--config',
      join(root, '.lintstagedrc.cjs'),
      '--no-stash',
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        ORDER_LOG: orderLog,
      },
      stdin: null,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  if (exitCode !== 0) {
    throw new Error(`lint-staged failed (${exitCode})\n${stdout}${stderr}`)
  }
  expect(await readFile(orderLog, 'utf8')).toBe(
    'biome:start\nbiome:end\ntypecheck:after\n',
  )
})
