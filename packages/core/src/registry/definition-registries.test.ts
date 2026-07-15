import { describe, expect, test } from 'bun:test'
import {
  defineAdapter,
  defineExtension,
  defineProfile,
} from '@ctxindex/extension-sdk'
import { z } from 'zod'
import {
  createAdapterRegistry,
  createExtensionRegistry,
  DefinitionRegistryError,
} from './definition-registries'
import { createProfileRegistry } from './profile-registry'

const createDraftInput = z.object({ subject: z.string() })
const messageProfile = defineProfile({
  id: 'fake.message',
  version: 1,
  schema: z.object({ subject: z.string() }),
  actions: {
    'fake.message.draft.create': {
      effect: 'reversible',
      input: createDraftInput,
      output: { id: 'fake.message', version: 1 },
      docs: 'Create a fake draft',
    },
  },
})

test('requires routing capabilities while indexed may support remote override', () => {
  const profiles = createProfileRegistry([messageProfile])
  const remote = async () => ({ resources: [], warnings: [] })

  expect(() =>
    createAdapterRegistry(profiles, [
      { ...validAdapter(), routing: 'federated' },
    ]),
  ).toThrow('Routing federated requires capability search-remote')
  expect(() =>
    createAdapterRegistry(profiles, [
      {
        ...validAdapter(),
        routing: 'hybrid',
        capabilities: ['retrieve', 'search-remote'] as const,
        operations: {
          ...validAdapter().operations,
          searchRemote: remote,
        },
      },
    ]),
  ).toThrow('Routing hybrid requires capabilities sync and search-remote')

  const indexedRemote = {
    ...validAdapter(),
    capabilities: ['retrieve', 'search-remote'] as const,
    operations: { ...validAdapter().operations, searchRemote: remote },
  }
  expect(createAdapterRegistry(profiles, [indexedRemote]).list()).toEqual([
    indexedRemote,
  ])
})

const validActionBinding = {
  profile: { id: 'fake.message', version: 1 },
  input: createDraftInput,
  output: { id: 'fake.message', version: 1 },
  run: async () => ({}),
} as const

function validAdapter() {
  return defineAdapter({
    id: 'fake.mailbox',
    version: 1,
    configSchema: z.object({ account: z.string() }),
    auth: { kind: 'none' },
    profiles: [{ id: 'fake.message', version: 1 }],
    routing: 'indexed',
    capabilities: ['retrieve'],
    operations: { retrieve: async () => {} },
    actions: { 'fake.message.draft.create': validActionBinding },
  })
}

describe('AdapterRegistry', () => {
  test('requires a declarative auth specification', () => {
    const profiles = createProfileRegistry([messageProfile])
    const missingAuth = { ...validAdapter() } as Record<string, unknown>
    delete missingAuth.auth

    expect(() =>
      createAdapterRegistry(profiles, [missingAuth as never]),
    ).toThrow('Invalid Adapter definition')
  })

  test('rejects capability and operation mismatches', () => {
    const profiles = createProfileRegistry([messageProfile])
    const adapter = { ...validAdapter(), operations: {} }

    expect(() => createAdapterRegistry(profiles, [adapter])).toThrow(
      'Capability retrieve requires operation retrieve',
    )
    expect(() =>
      createAdapterRegistry(profiles, [
        { ...validAdapter(), capabilities: [] as const },
      ]),
    ).toThrow('Operation retrieve requires capability retrieve')
  })

  test('accepts a supported Profile with an unbound optional Action', () => {
    const profiles = createProfileRegistry([messageProfile])
    const adapter = { ...validAdapter(), actions: {} }

    expect(createAdapterRegistry(profiles, [adapter]).list()).toEqual([adapter])
  })

  test('rejects undeclared and schema-incompatible Actions', () => {
    const profiles = createProfileRegistry([messageProfile])
    const extra = {
      ...validAdapter(),
      actions: {
        ...validAdapter().actions,
        'fake.message.send': validActionBinding,
      },
    }
    expect(() => createAdapterRegistry(profiles, [extra])).toThrow(
      'Undeclared Action fake.message.send',
    )

    const incompatible = {
      ...validAdapter(),
      actions: {
        'fake.message.draft.create': {
          ...validActionBinding,
          input: z.object({ subject: z.number() }),
        },
      },
    }
    expect(() => createAdapterRegistry(profiles, [incompatible])).toThrow(
      'Incompatible input schema for Action fake.message.draft.create',
    )
  })
})

describe('ExtensionRegistry', () => {
  test('rejects an invalid Extension atomically', () => {
    const base = defineExtension({
      id: 'base',
      version: 1,
      profiles: [messageProfile],
      adapters: [validAdapter()],
    })
    const registry = createExtensionRegistry([base])
    const extraProfile = defineProfile({
      id: 'fake.extra',
      version: 1,
      schema: z.object({ value: z.string() }),
    })
    const invalid = defineExtension({
      id: 'invalid',
      version: 1,
      profiles: [extraProfile],
      adapters: [
        {
          ...validAdapter(),
          id: 'fake.invalid',
          profiles: [{ id: 'fake.extra', version: 1 }],
        },
      ],
    })

    expect(() => registry.register(invalid)).toThrow(DefinitionRegistryError)
    expect(
      registry.profiles.get({ id: 'fake.extra', version: 1 }),
    ).toBeUndefined()
    expect(registry.list()).toEqual([base])
  })
})
