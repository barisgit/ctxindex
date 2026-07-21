import { expect, test } from 'bun:test'
import type { DirectDatabaseOwnership } from '../direct-database'
import { createExtensionMutationCoordinator } from './daemon-coordination'

function ownership(events: string[]): DirectDatabaseOwnership {
  return {
    target: '/tmp/ctxindex.sqlite',
    readLocalOAuthAppIdentities: async () => [],
    readDirectExtensionSourceBindings: async () => [],
    open: async () => {
      throw new Error('unexpected database open')
    },
    close: () => events.push('release'),
  }
}

test('stops a running daemon, retains direct ownership for the mutation, then restarts', async () => {
  const events: string[] = []
  const coordinate = createExtensionMutationCoordinator({
    status: async () => {
      events.push('status')
      return {
        status: 'running',
        health: {} as never,
      }
    },
    stop: async () => {
      events.push('stop')
      return { status: 'stopped', alreadyStopped: false }
    },
    start: async () => {
      events.push('start')
      return { status: 'running', started: true, health: {} as never }
    },
    acquireOwnership: () => {
      events.push('acquire')
      return ownership(events)
    },
  })

  await expect(
    coordinate(async () => {
      events.push('mutate')
      return 'installed'
    }),
  ).resolves.toBe('installed')
  expect(events).toEqual([
    'status',
    'stop',
    'acquire',
    'mutate',
    'release',
    'start',
  ])
})

test('retains ownership without starting a daemon that was stopped', async () => {
  const events: string[] = []
  const coordinate = createExtensionMutationCoordinator({
    status: async () => ({ status: 'stopped' }),
    stop: async () => {
      throw new Error('unexpected stop')
    },
    start: async () => {
      throw new Error('unexpected start')
    },
    acquireOwnership: () => ownership(events),
  })

  await coordinate(async () => events.push('mutate'))
  expect(events).toEqual(['mutate', 'release'])
})

test('unsupported daemon ownership preserves the direct mutation path', async () => {
  const events: string[] = []
  const coordinate = createExtensionMutationCoordinator({
    status: async () => ({ status: 'unsupported' }),
    stop: async () => {
      throw new Error('unexpected stop')
    },
    start: async () => {
      throw new Error('unexpected start')
    },
    acquireOwnership: () => ownership(events),
  })

  await coordinate(async () => events.push('mutate'))
  expect(events).toEqual(['mutate', 'release'])
})

test('releases ownership and restores a running daemon after mutation failure', async () => {
  const events: string[] = []
  const failure = new Error('invalid extension')
  const coordinate = createExtensionMutationCoordinator({
    status: async () => ({ status: 'running', health: {} as never }),
    stop: async () => {
      events.push('stop')
      return { status: 'stopped', alreadyStopped: false }
    },
    start: async () => {
      events.push('start')
      return { status: 'running', started: true, health: {} as never }
    },
    acquireOwnership: () => ownership(events),
  })

  await expect(
    coordinate(async () => {
      events.push('mutate')
      throw failure
    }),
  ).rejects.toBe(failure)
  expect(events).toEqual(['stop', 'mutate', 'release', 'start'])
})

test('restores a running daemon when shutdown observation is cancelled after acceptance', async () => {
  const events: string[] = []
  const cancellation = Object.assign(new Error('shutdown cancelled'), {
    code: 'cancelled',
  })
  const coordinate = createExtensionMutationCoordinator({
    status: async () => ({ status: 'running', health: {} as never }),
    stop: async () => {
      events.push('stop')
      throw cancellation
    },
    start: async (signal) => {
      expect(signal).toBeUndefined()
      events.push('start')
      return { status: 'running', started: true, health: {} as never }
    },
    acquireOwnership: () => {
      events.push('acquire')
      return ownership(events)
    },
  })

  await expect(
    coordinate(async () => {
      events.push('mutate')
    }),
  ).rejects.toBe(cancellation)
  expect(events).toEqual(['stop', 'start'])
})

test('keeps the mutation failure primary when restoration also fails', async () => {
  const mutationFailure = new Error('invalid extension')
  const coordinate = createExtensionMutationCoordinator({
    status: async () => ({ status: 'running', health: {} as never }),
    stop: async () => ({ status: 'stopped', alreadyStopped: false }),
    start: async () => {
      throw new Error('restart failed')
    },
    acquireOwnership: () => ownership([]),
  })

  await expect(
    coordinate(async () => {
      throw mutationFailure
    }),
  ).rejects.toBe(mutationFailure)
})

test('surfaces restoration failure after a successful mutation', async () => {
  const restartFailure = new Error('restart failed')
  const coordinate = createExtensionMutationCoordinator({
    status: async () => ({ status: 'running', health: {} as never }),
    stop: async () => ({ status: 'stopped', alreadyStopped: false }),
    start: async () => {
      throw restartFailure
    },
    acquireOwnership: () => ownership([]),
  })

  await expect(coordinate(async () => 'installed')).rejects.toBe(restartFailure)
})
