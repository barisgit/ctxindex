import { expect, test } from 'bun:test'

const currentFacingPaths = [
  'openspec/specs/core-model/spec.md',
  'openspec/specs/generic-storage/spec.md',
  'SYSTEM.md',
] as const

async function read(
  path: (typeof currentFacingPaths)[number],
): Promise<string> {
  return Bun.file(path).text()
}

test('current-facing docs use typed natural keys without a separate external-reference store', async () => {
  const [coreModel, genericStorage, system] = await Promise.all(
    currentFacingPaths.map(read),
  )
  const prose = [coreModel, genericStorage, system].join('\n')

  for (const document of [coreModel, system]) {
    expect(document).toMatch(/communication\.message.*rfcMessageId/is)
    expect(document).toMatch(/zero-to-many.*across Sources/is)
    expect(document).toMatch(/Source-scoped (?:Resource )?Ref/i)
    expect(document).toMatch(/cross-Source.*(?:collapse|identity).*deferred/is)
  }

  expect(prose).toMatch(/typed Profile field/i)
  expect(prose).toMatch(/normalized RFC `Message-ID` header value/i)
  expect(prose).toMatch(/natural-key Relations?.*field index/is)
  expect(prose).toMatch(/distinct Source-scoped Resources?/i)
  expect(genericStorage).toMatch(
    /Provider identifiers.*Source-scoped Resource Refs.*typed Profile fields.*field-index rows/is,
  )
  expect(genericStorage).not.toContain('external_refs')
  expect(system).toMatch(
    /identifiers.*Source-scoped Resource Refs.*envelope metadata.*typed Profile fields.*no separate external-reference store/is,
  )
  expect(prose).not.toContain(
    'A resource MAY have multiple external references.',
  )
  expect(prose).not.toMatch(
    /Mailbox sources SHOULD store .* as a first-class external reference/is,
  )
  expect(prose).not.toContain(
    'External identity uniqueness is scoped by Source, external kind, and external id.',
  )
  expect(prose).not.toContain('source_id + external_kind + external_id')
})
