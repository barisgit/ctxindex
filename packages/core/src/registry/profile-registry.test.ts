import { describe, expect, test } from 'bun:test'
import { defineProfile } from '@ctxindex/extension-sdk'
import { z } from 'zod'
import {
  createProfileRegistry,
  DefinitionRegistryError,
} from './profile-registry'

const profile = defineProfile({
  id: 'fake.note',
  version: 1,
  schema: z.object({ title: z.string() }),
})

describe('ProfileRegistry', () => {
  test('validates dynamic definitions before registration', () => {
    expect(() =>
      createProfileRegistry([
        { id: 'broken', version: 0, schema: {} } as never,
      ]),
    ).toThrow(DefinitionRegistryError)
    expect(createProfileRegistry([profile]).list()).toEqual([profile])
  })

  test('enforces the shared route-safe Profile id grammar', () => {
    for (const id of ['../escape', 'a'.repeat(129), '\uD800']) {
      expect(() => createProfileRegistry([{ ...profile, id }])).toThrow(
        DefinitionRegistryError,
      )
    }
  })

  test('rejects a non-function Profile summary projection', () => {
    expect(() =>
      createProfileRegistry([
        {
          ...profile,
          search: { summary: 'not a function' },
        } as never,
      ]),
    ).toThrow(DefinitionRegistryError)
  })

  test('rejects Action effects outside the reversible/irreversible contract', () => {
    expect(() =>
      createProfileRegistry([
        {
          ...profile,
          actions: {
            'fake.note.read': {
              effect: 'read',
              input: z.object({}),
              output: { id: 'fake.note', version: 1 },
            },
          },
        } as never,
      ]),
    ).toThrow(DefinitionRegistryError)
  })

  test('rejects an empty Profile Action id', () => {
    expect(() =>
      createProfileRegistry([
        {
          ...profile,
          actions: {
            '': {
              effect: 'reversible',
              input: z.object({}),
              output: { id: 'fake.note', version: 1 },
            },
          },
        } as never,
      ]),
    ).toThrow('Invalid Profile definition')
  })

  test('rejects duplicate id and version pairs', () => {
    expect(() => createProfileRegistry([profile, { ...profile }])).toThrow(
      'Duplicate Profile fake.note@1',
    )
  })

  test('rejects removed embedded documentation metadata', () => {
    expect(() =>
      createProfileRegistry([
        { ...profile, docs: { summary: 'legacy' } } as never,
      ]),
    ).toThrow(DefinitionRegistryError)
    expect(() =>
      createProfileRegistry([
        {
          ...profile,
          search: {
            fields: {
              title: {
                type: 'string',
                extract: () => 'title',
                docs: 'legacy',
              },
            },
          },
        },
      ] as never),
    ).toThrow(DefinitionRegistryError)
  })

  test('degrades unknown profile versions without throwing', () => {
    const warnings: unknown[] = []
    const registry = createProfileRegistry([profile], {
      onWarning: (warning) => warnings.push(warning),
    })

    expect(registry.resolve({ id: 'fake.note', version: 2 })).toEqual({
      status: 'degraded',
      id: 'fake.note',
      version: 2,
    })
    expect(warnings).toEqual([
      {
        code: 'unknown_profile_version',
        profileId: 'fake.note',
        profileVersion: 2,
      },
    ])
  })
})

test('kind lookup resolves canonical ids only', () => {
  const alphaV1 = defineProfile({
    id: 'alpha.record',
    version: 1,
    schema: z.object({}),
  })
  const alphaV2 = defineProfile({ ...alphaV1, version: 2 })
  const beta = defineProfile({
    id: 'beta.record',
    version: 1,
    schema: z.object({}),
  })
  const registry = createProfileRegistry([beta, alphaV2, alphaV1])

  expect(registry.resolveKind(' alpha.record ')).toMatchObject({
    status: 'known',
    id: 'alpha.record',
    profiles: [{ version: 1 }, { version: 2 }],
  })
  expect(registry.resolveKind(' DOCS ')).toEqual({
    status: 'unknown',
    kind: 'docs',
  })
  expect(registry.resolveKind('missing')).toEqual({
    status: 'unknown',
    kind: 'missing',
  })
})
