import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '../../../..')
const entrypoint = join(repoRoot, 'apps/cli/bin/ctxindex.mjs')
const extensionPath = join(repoRoot, 'examples/tenders-extension/extension.ts')

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

    const described = await run(['describe', '--json'])
    expect(described.exitCode, described.stderr).toBe(0)
    expect(described.stderr).toBe('')
    const registry = JSON.parse(described.stdout)
    expect(registry.kinds).toContainEqual(
      expect.objectContaining({
        id: 'enarocanje.tender',
        aliases: ['tenders'],
      }),
    )
    expect(registry.sources).toContainEqual(
      expect.objectContaining({ id: 'enarocanje.fixture' }),
    )

    const selectedProfile = await run([
      'describe',
      'profile',
      'enarocanje.tender',
      '--json',
    ])
    expect(JSON.parse(selectedProfile.stdout)).toEqual([
      expect.objectContaining({ id: 'enarocanje.tender' }),
    ])
    const unknownSelector = await run(['describe', 'kind'])
    expect(unknownSelector.exitCode).toBe(2)
    expect(unknownSelector.stderr).toContain('unknown selector')
    const unknown = await run(['describe', 'adapter', 'missing'])
    expect(unknown.exitCode).toBe(2)
    expect(unknown.stderr).toContain('unknown adapter id')
    const text = await run(['describe', 'action'])
    expect(text.exitCode, text.stderr).toBe(0)
    expect(text.stdout).toContain('ACTION communication.message.draft.create')

    const markdown = await run(['describe', '--format', 'markdown'])
    expect(markdown.exitCode, markdown.stderr).toBe(0)
    expect(markdown.stdout).toContain('### enarocanje.tender@1')
    expect(markdown.stdout).toContain('`reference` (string)')

    const help = await run([])
    expect(help.exitCode, help.stderr).toBe(0)
    expect(help.stdout).toContain('enarocanje.tender@1')
    expect(help.stdout).toContain('aliases: tenders')

    for (const args of [
      ['search', '--help'],
      ['export', '--help'],
      ['action', '--help'],
      ['describe', '--help'],
      ['extensions', '--help'],
    ]) {
      const commandHelp = await run(args)
      expect(commandHelp.exitCode, commandHelp.stderr).toBe(0)
      expect(commandHelp.stdout).toContain('Loaded interface:')
      expect(commandHelp.stdout).toContain('enarocanje.tender@1')
    }

    const extensions = await run(['extensions', 'list', '--json'])
    expect(extensions.exitCode, extensions.stderr).toBe(0)
    expect(JSON.parse(extensions.stdout)).toContainEqual({
      id: 'enarocanje.proof',
      version: 1,
      profiles: [{ id: 'enarocanje.tender', version: 1 }],
      adapters: [{ id: 'enarocanje.fixture', version: 1 }],
      summary: 'External tenders Extension proof.',
    })

    const builtInHelp = await run(['source', 'add', '--help'])
    expect(builtInHelp.exitCode, builtInHelp.stderr).toBe(0)
    expect(builtInHelp.stdout).toContain('--config-root-path')

    await writeFile(
      join(configDir, 'ctxindex', 'config.toml'),
      `[extensions]\npaths = ${JSON.stringify([extensionPath, join(root, 'missing.ts')])}\n\n[secrets]\nbackend = "keychain"\n\n[log]\nlevel = "info"\n\n[log.file]\nrotate = "daily"\nretain_days = 14\ncompress = true\n`,
    )
    const degradedHelp = await run(['--help'])
    expect(degradedHelp.exitCode).toBe(0)
    expect(degradedHelp.stderr).toContain('missing.ts')
    expect(degradedHelp.stdout).toContain('enarocanje.tender@1')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
