import { expect, test } from 'bun:test'

const codemapPaths = [
  'packages/profiles/codemap.md',
  'packages/profiles/src/codemap.md',
] as const

test('profile codemaps describe bundled Adapter parity', async () => {
  const codemaps = await Promise.all(
    codemapPaths.map((path) => Bun.file(path).text()),
  )

  for (const codemap of codemaps) {
    const normalizedCodemap = codemap.replace(/\s+/g, ' ')

    expect(normalizedCodemap).toMatch(
      /Google and Microsoft mailbox Adapters target `mail\.message@1`/,
    )
    expect(normalizedCodemap).toMatch(
      /bind the same `mail\.message\.draft\.create` and `mail\.message\.draft\.update` Actions/,
    )
    expect(normalizedCodemap).toMatch(
      /Google and Microsoft calendar Adapters target `calendar\.event@1`/,
    )
    expect(normalizedCodemap).toMatch(
      /local-directory Adapter targets `file@1`/,
    )
  }

  expect(codemaps.join('\n')).not.toMatch(/binds? Gmail Draft Actions/)

  const sourceCodemap = codemaps[1]
  expect(sourceCodemap).toContain('`packages/official/src/google-mailbox/`')
  expect(sourceCodemap).toContain('`packages/official/src/microsoft/mailbox/`')
  expect(sourceCodemap).toMatch(
    /Google and Microsoft provider modules.*create and consume mail-message payloads.*local-directory emits file payloads/s,
  )
  expect(sourceCodemap).not.toMatch(/Gmail provider modules under/)
})
