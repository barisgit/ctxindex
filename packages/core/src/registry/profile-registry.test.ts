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
  docs: { summary: 'Fake notes', aliases: ['note'] },
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
              docs: 'Invalid non-mutation Action',
            },
          },
        } as never,
      ]),
    ).toThrow(DefinitionRegistryError)
  })

  test('rejects duplicate id and version pairs', () => {
    expect(() => createProfileRegistry([profile, { ...profile }])).toThrow(
      'Duplicate Profile fake.note@1',
    )
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
