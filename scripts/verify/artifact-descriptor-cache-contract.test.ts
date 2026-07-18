import { expect, test } from 'bun:test'

const currentFacingPaths = [
  'openspec/specs/core-model/spec.md',
  'openspec/specs/generic-storage/implementation.md',
  'CONTEXT.md',
  'SYSTEM.md',
] as const

async function read(
  path: (typeof currentFacingPaths)[number],
): Promise<string> {
  return Bun.file(path).text()
}

test('current-facing docs distinguish Artifact descriptors from cached bytes', async () => {
  const [coreModel, genericStorage, context, system] = await Promise.all(
    currentFacingPaths.map(read),
  )
  const prose = [coreModel, genericStorage, context, system].join('\n')

  for (const document of [coreModel, context, system]) {
    expect(document).toMatch(/Profile-derived (?:Artifact )?descriptor/i)
  }
  for (const document of [coreModel, context, system])
    expect(document).toMatch(/Source-scoped/i)

  expect(coreModel).toMatch(
    /Artifact bytes enter the managed content-addressed cache only when download is requested/i,
  )
  expect(context).toMatch(/bytes are fetched and cached only on download/i)
  expect(system).toMatch(/provider bytes.*on demand.*content-addressed cache/is)
  expect(genericStorage).toMatch(
    /Profiles derive Artifact descriptors on demand from the validated Resource payload/i,
  )
  expect(genericStorage).toMatch(
    /cached Artifact-byte metadata is written only by the download path/i,
  )

  expect(prose).toMatch(
    /purge[\s\S]{0,180}(?:preserv|leav)[\s\S]{0,180}(?:Resource|descriptor)/i,
  )
  expect(prose).toMatch(
    /Profile exports[\s\S]{0,180}(?:rendered|streamed)[\s\S]{0,180}(?:not|without)[\s\S]{0,120}Artifact/i,
  )
  expect(prose).toMatch(
    /raw provider payload[\s\S]{0,180}(?:separate|not)[\s\S]{0,120}Artifact/i,
  )

  expect(prose).not.toContain(
    'managed content-addressed artifact store for attachments, raw records, and rendered exports',
  )
  expect(prose).not.toMatch(
    /Artifact[^.\n]{0,40}(?:is|means) downloadable bytes associated with context/i,
  )
  expect(genericStorage).not.toMatch(/replace[^.\n]*Artifact descriptors/i)
})
