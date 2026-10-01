import { afterEach, expect, test } from 'bun:test'
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as TOML from '@iarna/toml'
import { readConfig, writeConfig } from './io'
import { defaultConfig } from './schema'

const originalCwd = process.cwd()
const sandboxes: string[] = []

afterEach(async () => {
  process.chdir(originalCwd)
  await Promise.all(
    sandboxes.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

async function createSandbox(): Promise<string> {
  // The real path keeps expectations exact on hosts whose tmpdir is a symlink.
  const dir = await realpath(
    await mkdtemp(join(tmpdir(), 'ctxindex-config-io-')),
  )
  sandboxes.push(dir)
  return dir
}

function configToml(paths: readonly string[]): string {
  return TOML.stringify({
    extensions: { paths: [...paths] },
    secrets: { backend: 'file' },
    log: {
      level: 'info',
      file: { rotate: 'daily', retain_days: 14, compress: true },
    },
  })
}

test('relative Extension paths resolve against the configuration origin, not the process working directory', async () => {
  const sandbox = await createSandbox()
  const configRoot = join(sandbox, 'config')
  const unrelated = join(sandbox, 'unrelated', 'cwd')
  await mkdir(configRoot, { recursive: true })
  await mkdir(unrelated, { recursive: true })
  const filePath = join(configRoot, 'config.toml')
  await writeFile(
    filePath,
    configToml(['../extensions/fixture', './local', '/absolute/./ext']),
  )

  const expected = [
    join(sandbox, 'extensions', 'fixture'),
    join(configRoot, 'local'),
    '/absolute/ext',
  ]
  process.chdir(unrelated)
  expect((await readConfig(filePath)).extensions.paths).toEqual(expected)
  process.chdir('/')
  expect((await readConfig(filePath)).extensions.paths).toEqual(expected)
})

test('an aliased configuration origin projects the same canonical Extension paths', async () => {
  const sandbox = await createSandbox()
  const configRoot = join(sandbox, 'real', 'config')
  const alias = join(sandbox, 'alias-config')
  await mkdir(configRoot, { recursive: true })
  await symlink(configRoot, alias)
  await writeFile(join(configRoot, 'config.toml'), configToml(['../ext']))

  const direct = await readConfig(join(configRoot, 'config.toml'))
  const aliased = await readConfig(join(alias, 'config.toml'))

  expect(direct.extensions.paths).toEqual([join(sandbox, 'real', 'ext')])
  expect(aliased.extensions.paths).toEqual(direct.extensions.paths)
})

test('writeConfig persists Extension paths in canonical launch-directory-independent form', async () => {
  const sandbox = await createSandbox()
  const configRoot = join(sandbox, 'config')
  const filePath = join(configRoot, 'config.toml')
  process.chdir('/')

  await writeConfig(
    {
      ...defaultConfig(),
      extensions: { paths: ['../extensions/fixture', '/absolute/../ext'] },
    },
    filePath,
  )

  const stored = TOML.parse(await readFile(filePath, 'utf8')) as {
    extensions: { paths: string[] }
  }
  expect(stored.extensions.paths).toEqual([
    join(sandbox, 'extensions', 'fixture'),
    '/ext',
  ])
  expect((await readConfig(filePath)).extensions.paths).toEqual(
    stored.extensions.paths,
  )
})

test('a configuration without Extension paths keeps its default projection', async () => {
  const sandbox = await createSandbox()
  const filePath = join(sandbox, 'config.toml')

  expect(await readConfig(filePath)).toEqual(defaultConfig())
  await writeFile(filePath, configToml([]))
  expect((await readConfig(filePath)).extensions.paths).toEqual([])
})
