import { expect, test } from 'bun:test'
import { exists } from 'node:fs/promises'
import { CTXINDEX_BUILTIN_EXTENSIONS } from '@ctxindex/adapters'

test('legacy private registry vocabulary is removed from the public core', async () => {
  for (const path of [
    'packages/core/src/registry/types.ts',
    'packages/core/src/registry/registry-core.ts',
    'packages/core/src/registry/handle.ts',
  ])
    expect(await exists(path)).toBe(false)
  const index = await Bun.file('packages/core/src/registry/index.ts').text()
  expect(index).not.toMatch(/\.\/(types|registry-core|handle)'/)
})

test('workflow skills point to runtime vocabulary instead of declaring it', async () => {
  const prose = await Promise.all([
    Bun.file('skills/getting-started.md').text(),
    Bun.file('skills/reference/cli-overview.md').text(),
    Bun.file('docs/AGENT-HOWTOS.md').text(),
  ]).then((parts) => parts.join('\n'))
  const forbidden = new Set<string>()
  for (const extension of CTXINDEX_BUILTIN_EXTENSIONS) {
    for (const profile of extension.profiles) {
      forbidden.add(profile.id)
      for (const alias of profile.docs?.aliases ?? []) forbidden.add(alias)
      for (const field of Object.keys(profile.search?.fields ?? {}))
        forbidden.add(field)
      for (const format of Object.keys(profile.exports ?? {}))
        forbidden.add(format)
      for (const action of Object.keys(profile.actions ?? {}))
        forbidden.add(action)
    }
  }
  for (const term of forbidden) expect(prose).not.toContain(`\`${term}\``)
  expect(prose).toContain('ctxindex describe --format markdown')
  expect(prose).toContain('ctxindex extensions list')
  expect(prose).not.toContain('--config-root-path')
})
