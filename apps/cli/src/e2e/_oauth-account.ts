import { chmod, mkdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function installLoopbackBrowser(dir: string): Promise<string> {
  const bin = join(dir, 'bin')
  await mkdir(bin, { recursive: true })
  const path = join(bin, 'open')
  await writeFile(
    path,
    [
      '#!/usr/bin/env bun',
      'const authorization = new URL(Bun.argv[2])',
      "const redirect = authorization.searchParams.get('redirect_uri')",
      "const state = authorization.searchParams.get('state')",
      "if (!redirect || !state) throw new Error('missing loopback params')",
      'const callback = new URL(redirect)',
      "callback.searchParams.set('code', 'mock-code')",
      "callback.searchParams.set('state', state)",
      'const response = await fetch(callback)',
      "if (!response.ok) throw new Error('loopback callback failed')",
    ].join('\n'),
  )
  await chmod(path, 0o755)
  // Linux launches 'xdg-open'; expose the same mock under both names.
  await symlink(path, join(bin, 'xdg-open'))
  return bin
}
