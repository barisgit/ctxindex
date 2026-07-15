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
const actionId = 'fake.message.draft.create'
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

test('rejects an empty Adapter Action id', () => {
  const profiles = createProfileRegistry([messageProfile])
  const adapter = {
    ...validAdapter(),
    actions: { '': validActionBinding },
  }

  expect(() => createAdapterRegistry(profiles, [adapter])).toThrow(
    'Invalid Adapter definition',
  )
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
  run: async () => ({
    ref: 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/draft/one',
    profile: { id: 'fake.message', version: 1 },
    payload: { subject: 'Draft' },
  }),
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
  test('rejects Profile Actions whose output Profile is not loaded', () => {
    const invalidProfile = defineProfile({
      ...messageProfile,
      actions: {
        [actionId]: {
          effect: 'reversible',
          input: createDraftInput,
          output: { id: 'fake.missing', version: 1 },
          docs: 'Invalid output Profile',
        },
      },
    })

    try {
      createAdapterRegistry(createProfileRegistry([invalidProfile]), [])
      throw new Error('expected unknown Action output rejection')
    } catch (error) {
      expect(error).toBeInstanceOf(DefinitionRegistryError)
      expect(error).toMatchObject({ code: 'unknown_profile' })
      expect(String(error)).toContain(actionId)
      expect(String(error)).toContain('fake.missing@1')
    }
  })

  test('rejects malformed Action bindings as invalid definitions', () => {
    const profiles = createProfileRegistry([messageProfile])
    for (const run of [undefined, 'not-a-function']) {
      const adapter = {
        ...validAdapter(),
        actions: {
          'fake.message.draft.create': { ...validActionBinding, run },
        },
      }

      try {
        createAdapterRegistry(profiles, [adapter as never])
        throw new Error('expected malformed binding rejection')
      } catch (error) {
        expect(error).toBeInstanceOf(DefinitionRegistryError)
        expect(error).toMatchObject({ code: 'invalid_definition' })
      }
    }
  })

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

    const wrongProfile = {
      ...validAdapter(),
      actions: {
        'fake.message.draft.create': {
          ...validActionBinding,
          profile: { id: 'fake.other', version: 1 },
        },
      },
    }
    expect(() => createAdapterRegistry(profiles, [wrongProfile])).toThrow(
      'Action fake.message.draft.create is bound to the wrong Profile',
    )

    const wrongOutput = {
      ...validAdapter(),
      actions: {
        'fake.message.draft.create': {
          ...validActionBinding,
          output: { id: 'fake.other', version: 1 },
        },
      },
    }
    expect(() => createAdapterRegistry(profiles, [wrongOutput])).toThrow(
      'Incompatible output contract for Action fake.message.draft.create',
    )
  })
})

describe('ExtensionRegistry', () => {
  test('rejects an unknown Action output atomically during registration', () => {
    const base = defineExtension({
      id: 'base',
      version: 1,
      profiles: [messageProfile],
      adapters: [validAdapter()],
    })
    const registry = createExtensionRegistry([base])
    const invalidProfile = defineProfile({
      id: 'fake.invalid-output',
      version: 1,
      schema: z.object({ value: z.string() }),
      actions: {
        'fake.invalid-output.create': {
          effect: 'reversible',
          input: z.object({ value: z.string() }),
          output: { id: 'fake.missing', version: 1 },
          docs: 'Invalid output contract',
        },
      },
    })
    const invalid = defineExtension({
      id: 'invalid-output',
      version: 1,
      profiles: [invalidProfile],
      adapters: [],
    })

    expect(() => registry.register(invalid)).toThrow(
      'Action fake.invalid-output.create references unknown output Profile fake.missing@1',
    )
    expect(
      registry.profiles.get({ id: 'fake.invalid-output', version: 1 }),
    ).toBeUndefined()
    expect(registry.list()).toEqual([base])
  })

  test('rejects duplicate global Action ids atomically', () => {
    const base = defineExtension({
      id: 'base',
      version: 1,
      profiles: [messageProfile],
      adapters: [validAdapter()],
    })
    const registry = createExtensionRegistry([base])
    const duplicateActionProfile = defineProfile({
      id: 'fake.other',
      version: 1,
      schema: z.object({ value: z.string() }),
      actions: {
        'fake.message.draft.create': {
          effect: 'reversible',
          input: z.object({ value: z.string() }),
          output: { id: 'fake.other', version: 1 },
          docs: 'Duplicate bare Action id',
        },
      },
    })
    const duplicate = defineExtension({
      id: 'duplicate',
      version: 1,
      profiles: [duplicateActionProfile],
      adapters: [],
    })

    try {
      registry.register(duplicate)
      throw new Error('expected duplicate Action rejection')
    } catch (error) {
      expect(error).toBeInstanceOf(DefinitionRegistryError)
      expect(error).toMatchObject({ code: 'action_binding_mismatch' })
      expect(String(error)).toContain('fake.message.draft.create')
    }
    expect(
      registry.profiles.get({ id: 'fake.other', version: 1 }),
    ).toBeUndefined()
    expect(registry.list()).toEqual([base])
  })

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
