import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as TOML from '@iarna/toml'
import { writeConfig } from '../config'
import { FileBackend } from './file'
import { KeychainBackend } from './keychain'

const repoRoot = new URL('../../../../', import.meta.url).pathname
const cliBin = join(repoRoot, 'apps/cli/bin/ctxindex.mjs')

const envKeys = [
  'CTXINDEX_CONFIG_HOME',
  'CTXINDEX_DATA_HOME',
  'CTXINDEX_KEYTAR_MOCK_FILE',
  'CTXINDEX_SECRETS_PASSPHRASE',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
] as const

const savedEnv = new Map<string, string | undefined>()
for (const key of envKeys) savedEnv.set(key, process.env[key])

afterEach(() => {
  for (const key of envKeys) {
    const value = savedEnv.get(key)
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

function applyEnv(env: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

async function runCtxindex(
  args: string[],
  env: Record<string, string | undefined>,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const spawnEnv = { ...process.env }
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete spawnEnv[key]
    else spawnEnv[key] = value
  }
  const proc = Bun.spawn([process.execPath, cliBin, ...args], {
    cwd: repoRoot,
    env: spawnEnv,
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

test('ctxindex secrets migrate moves entries from keychain to file and back', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-secrets-migrate-'))
  const env = {
    CTXINDEX_CONFIG_HOME: undefined,
    CTXINDEX_DATA_HOME: undefined,
    CTXINDEX_KEYTAR_MOCK_FILE: join(root, 'keytar.json'),
    CTXINDEX_SECRETS_PASSPHRASE: undefined,
    XDG_CONFIG_HOME: join(root, 'config'),
    XDG_DATA_HOME: join(root, 'data'),
  }

  try {
    applyEnv(env)
    await writeConfig({
      secrets: { backend: 'keychain' },
      log: {
        level: 'info',
        file: { rotate: 'daily', retain_days: 14, compress: true },
      },
    })

    const keychain = new KeychainBackend()
    await keychain.setSecret('google', 'refresh-token', 'refresh-value')
    await keychain.setSecret('google', 'client-secret', 'client-value')

    const toFile = await runCtxindex(
      ['secrets', 'migrate', 'file', '--passphrase', 'portable'],
      env,
    )
    expect(toFile).toMatchObject({ exitCode: 0, stderr: '' })

    const fileStore = new FileBackend({ passphrase: 'portable' })
    expect(await fileStore.getSecret('file:secrets.box#refresh-token')).toBe(
      'refresh-value',
    )
    expect(await fileStore.getSecret('file:secrets.box#client-secret')).toBe(
      'client-value',
    )
    expect(
      TOML.parse(
        await Bun.file(join(root, 'config', 'ctxindex', 'config.toml')).text(),
      ),
    ).toMatchObject({ secrets: { backend: 'file' } })

    const toKeychain = await runCtxindex(
      ['secrets', 'migrate', 'keychain', '--passphrase', 'portable'],
      env,
    )
    expect(toKeychain).toMatchObject({ exitCode: 0, stderr: '' })

    expect(
      await keychain.getSecret('keychain:ctxindex/google/refresh-token'),
    ).toBe('refresh-value')
    expect(
      await keychain.getSecret('keychain:ctxindex/google/client-secret'),
    ).toBe('client-value')
    expect(
      TOML.parse(
        await Bun.file(join(root, 'config', 'ctxindex', 'config.toml')).text(),
      ),
    ).toMatchObject({ secrets: { backend: 'keychain' } })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('ctxindex secrets migrate file exits 2 without passphrase env or key file', async () => {
  const root = await mkdtemp(
    join(tmpdir(), 'ctxindex-secrets-migrate-missing-'),
  )
  const env = {
    CTXINDEX_CONFIG_HOME: undefined,
    CTXINDEX_DATA_HOME: undefined,
    CTXINDEX_KEYTAR_MOCK_FILE: join(root, 'keytar.json'),
    CTXINDEX_SECRETS_PASSPHRASE: undefined,
    XDG_CONFIG_HOME: join(root, 'config'),
    XDG_DATA_HOME: join(root, 'data'),
  }

  try {
    applyEnv(env)
    await writeConfig({
      secrets: { backend: 'keychain' },
      log: {
        level: 'info',
        file: { rotate: 'daily', retain_days: 14, compress: true },
      },
    })

    const result = await runCtxindex(['secrets', 'migrate', 'file'], env)
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain('--passphrase')
    expect(result.stderr).toContain('CTXINDEX_SECRETS_PASSPHRASE')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
