import { afterEach, expect, spyOn, test } from 'bun:test'
import { loadCliDefinitions } from '../definitions'
import {
  type DirectDatabaseOwnership,
  PrototypeUnsupportedError,
} from '../direct-database'
import { runCli } from '../main'
import {
  handleSourceCommand,
  resolveSourceCommandRoute,
  type SourceCommandDeps,
} from './handle-source-command'

afterEach(() => {
  process.removeAllListeners('SIGINT')
  process.exitCode = 0
})

const definitions = {
  rows: [
    {
      id: 'local.directory',
      configOptions: [
        {
          property: 'root_path',
          flag: '--config-root-path',
          type: 'string',
          required: true,
        },
      ],
    },
  ],
} as const

function fakeOwnership(events: string[]): DirectDatabaseOwnership {
  return {
    target: '/tmp/ctxindex-source-owner.sqlite',
    async readLocalOAuthAppIdentities() {
      events.push('read-identities')
      return []
    },
    async open() {
      throw new Error('ownership opened outside dependency composition')
    },
    close() {
      events.push('close-owner')
    },
  }
}

test('selected daemon handles Source add using its active definitions without direct open', async () => {
  const output: string[] = []
  const log = spyOn(console, 'log').mockImplementation((value) => {
    output.push(String(value))
  })
  let loadedLocalDefinitions = false
  let opened = false
  try {
    const exit = await handleSourceCommand(
      [
        'add',
        'local.directory',
        '--realm',
        'work',
        '--config-root-path',
        '/tmp/work',
      ],
      {
        selectDaemon: () => ({}) as never,
        sourceDefinitions: async () => definitions,
        sourceAdd: async (_selection, input) => {
          expect(input).toEqual({
            adapterId: 'local.directory',
            realmSlug: 'work',
            configJson: JSON.stringify({ root_path: '/tmp/work' }),
          })
          return { sourceId: 'source-1', realmId: 'work' }
        },
        sourceList: async () => ({ rows: [] }),
        sourceRemove: async () => ({ sourceId: 'unused' }),
        loadDefinitions: async () => {
          loadedLocalDefinitions = true
          throw new Error('local definitions loaded')
        },
        open: async () => {
          opened = true
          throw new Error('direct dependencies opened')
        },
      },
    )

    expect(exit).toBe(0)
    expect(loadedLocalDefinitions).toBe(false)
    expect(opened).toBe(false)
    expect(output).toEqual(['source added: source-1'])
  } finally {
    log.mockRestore()
  }
})

test('selected daemon handles Source list and remove without direct open', async () => {
  const output: string[] = []
  const log = spyOn(console, 'log').mockImplementation((value) => {
    output.push(String(value))
  })
  try {
    const deps = {
      selectDaemon: () => ({}) as never,
      sourceDefinitions: async () => definitions,
      sourceAdd: async () => ({ sourceId: 'unused', realmId: 'work' }),
      sourceList: async () => ({ rows: [] }),
      sourceRemove: async () => ({ sourceId: 'source-1' }),
      loadDefinitions: async () => {
        throw new Error('local definitions loaded')
      },
      open: async () => {
        throw new Error('direct dependencies opened')
      },
    }
    expect(await handleSourceCommand(['list', '--json'], deps)).toBe(0)
    expect(await handleSourceCommand(['remove', 'source-1'], deps)).toBe(0)
    expect(output).toEqual(['[]', 'source removed: source-1'])
  } finally {
    log.mockRestore()
  }
})

test('malformed Source commands exit locally without daemon transport', async () => {
  const error = spyOn(console, 'error').mockImplementation(() => {})
  let transports = 0
  const deps = {
    selectDaemon: () => ({}) as never,
    sourceDefinitions: async () => {
      transports += 1
      throw new Error('transport invoked')
    },
    sourceAdd: async () => {
      transports += 1
      throw new Error('transport invoked')
    },
    sourceList: async () => {
      transports += 1
      throw new Error('transport invoked')
    },
    sourceRemove: async () => {
      transports += 1
      throw new Error('transport invoked')
    },
    loadDefinitions: async () => {
      throw new Error('local definitions loaded')
    },
    open: async () => {
      throw new Error('direct dependencies opened')
    },
  }
  try {
    expect(await handleSourceCommand(['add'], deps)).toBe(2)
    expect(
      await handleSourceCommand(['add', 'local.directory', '--realm'], deps),
    ).toBe(2)
    expect(
      await handleSourceCommand(['add', 'local.directory', 'unexpected'], deps),
    ).toBe(2)
    expect(
      await handleSourceCommand(
        ['add', 'local.directory', '--search-routing', 'invalid'],
        deps,
      ),
    ).toBe(2)
    expect(await handleSourceCommand(['list', '--unknown'], deps)).toBe(2)
    expect(await handleSourceCommand(['remove'], deps)).toBe(2)
    expect(transports).toBe(0)
  } finally {
    error.mockRestore()
  }
})

test('runCli retains one selected daemon from Source argument construction through execution', async () => {
  const output: string[] = []
  const log = spyOn(console, 'log').mockImplementation((value) => {
    output.push(String(value))
  })
  const selection = { endpoint: 'retained' } as never
  let selections = 0
  let definitionRequests = 0
  let directLoads = 0
  let directOpens = 0
  const deps: SourceCommandDeps = {
    selectDaemon: () => {
      selections += 1
      return selections === 1 ? selection : null
    },
    sourceDefinitions: async (actual) => {
      expect(actual).toBe(selection)
      definitionRequests += 1
      return definitions
    },
    sourceAdd: async (actual, input) => {
      expect(actual).toBe(selection)
      expect(input).toMatchObject({
        adapterId: 'local.directory',
        configJson: JSON.stringify({ root_path: '/tmp/work' }),
      })
      return { sourceId: 'source-1', realmId: 'work' }
    },
    sourceList: async () => ({ rows: [] }),
    sourceRemove: async () => ({ sourceId: 'unused' }),
    loadDefinitions: async () => {
      directLoads += 1
      throw new Error('direct definitions loaded')
    },
    open: async () => {
      directOpens += 1
      throw new Error('direct dependencies opened')
    },
  }

  try {
    expect(
      await runCli(
        [
          'source',
          'add',
          'local.directory',
          '--realm',
          'work',
          '--config-root-path',
          '/tmp/work',
        ],
        { source: deps },
      ),
    ).toBe(0)
    expect(selections).toBe(1)
    expect(definitionRequests).toBe(1)
    expect(directLoads).toBe(0)
    expect(directOpens).toBe(0)
    expect(output).toEqual(['source added: source-1'])
  } finally {
    log.mockRestore()
  }
})

test('runCli rejects locally malformed Source argv before selection or transport', async () => {
  const error = spyOn(console, 'error').mockImplementation(() => {})
  let selections = 0
  let transports = 0
  const deps: SourceCommandDeps = {
    selectDaemon: () => {
      selections += 1
      return {} as never
    },
    sourceDefinitions: async () => {
      transports += 1
      throw new Error('transport invoked')
    },
    sourceAdd: async () => {
      transports += 1
      throw new Error('transport invoked')
    },
    sourceList: async () => {
      transports += 1
      throw new Error('transport invoked')
    },
    sourceRemove: async () => {
      transports += 1
      throw new Error('transport invoked')
    },
    loadDefinitions: async () => {
      throw new Error('direct definitions loaded')
    },
    open: async () => {
      throw new Error('direct dependencies opened')
    },
  }

  try {
    expect(
      await runCli(['source', 'add', 'local.directory', '--realm'], {
        source: deps,
      }),
    ).toBe(2)
    expect(selections).toBe(0)
    expect(transports).toBe(0)
  } finally {
    error.mockRestore()
  }
})

test('runCli loads active Source definitions for add help without executing', async () => {
  const output: string[] = []
  const log = spyOn(console, 'log').mockImplementation((value) => {
    output.push(String(value))
  })
  let definitionRequests = 0
  let executions = 0
  const deps: SourceCommandDeps = {
    selectDaemon: () => ({ endpoint: 'help' }) as never,
    sourceDefinitions: async () => {
      definitionRequests += 1
      return definitions
    },
    sourceAdd: async () => {
      executions += 1
      throw new Error('source add executed')
    },
    sourceList: async () => ({ rows: [] }),
    sourceRemove: async () => ({ sourceId: 'unused' }),
    loadDefinitions: async () => {
      throw new Error('direct definitions loaded')
    },
    open: async () => {
      throw new Error('direct dependencies opened')
    },
  }

  try {
    expect(await runCli(['source', 'add', '--help'], { source: deps })).toBe(0)
    expect(definitionRequests).toBe(1)
    expect(executions).toBe(0)
    expect(output.join('\n')).toContain('--config-root-path')
  } finally {
    log.mockRestore()
  }
})

test('direct Source add retains one ownership and definition snapshot through execution', async () => {
  const loaded = await loadCliDefinitions()
  const events: string[] = []
  const ownership = fakeOwnership(events)
  const output = spyOn(console, 'log').mockImplementation(() => {})
  let definitionLoads = 0
  try {
    const exit = await runCli(
      [
        'source',
        'add',
        'local.directory',
        '--realm',
        'work',
        '--config-root-path',
        '/tmp/work',
      ],
      {
        source: {
          selectDaemon: () => null,
          sourceDefinitions: async () => {
            throw new Error('daemon definitions requested')
          },
          sourceAdd: async () => {
            throw new Error('daemon add requested')
          },
          sourceList: async () => ({ rows: [] }),
          sourceRemove: async () => ({ sourceId: 'unused' }),
          acquireOwnership: () => {
            events.push('acquire-owner')
            return ownership
          },
          loadDefinitions: async (options) => {
            if (!options) throw new Error('definition options are required')
            definitionLoads += 1
            events.push('load-definitions')
            expect(options.localOAuthAppIdentities).toEqual([])
            return loaded
          },
          open: async (options) => {
            events.push('compose-deps')
            if (!options) throw new Error('direct options are required')
            expect(options.databaseOwnership).toBe(ownership)
            expect(options.definitions).toBe(loaded)
            return {
              registry: loaded.registry,
              authService: {},
              sourceService: {
                addSource: () => ({ sourceId: 'source-1' }),
              },
              close: async () => events.push('close-deps'),
            } as never
          },
        },
      },
    )

    expect(exit).toBe(0)
    expect(definitionLoads).toBe(1)
    expect(events).toEqual([
      'acquire-owner',
      'read-identities',
      'load-definitions',
      'compose-deps',
      'close-deps',
      'close-owner',
    ])
  } finally {
    output.mockRestore()
  }
})

test('direct Source ownership conflict fails before definition loading', async () => {
  const error = spyOn(console, 'error').mockImplementation(() => {})
  let loadedDefinitions = false
  try {
    const exit = await handleSourceCommand(['list'], {
      selectDaemon: () => null,
      sourceDefinitions: async () => ({ rows: [] }),
      sourceAdd: async () => ({ sourceId: 'unused', realmId: 'unused' }),
      sourceList: async () => ({ rows: [] }),
      sourceRemove: async () => ({ sourceId: 'unused' }),
      acquireOwnership: () => {
        throw new PrototypeUnsupportedError()
      },
      loadDefinitions: async () => {
        loadedDefinitions = true
        throw new Error('definitions loaded without ownership')
      },
      open: async () => {
        throw new Error('direct dependencies opened without ownership')
      },
    })

    expect(exit).toBe(50)
    expect(loadedDefinitions).toBe(false)
  } finally {
    error.mockRestore()
  }
})

test('Source add ownership conflict maps to prototype unsupported before dynamic definitions', async () => {
  const error = spyOn(console, 'error').mockImplementation(() => {})
  let loadedDefinitions = false
  try {
    const exit = await runCli(['source', 'add', 'local.directory'], {
      source: {
        selectDaemon: () => null,
        sourceDefinitions: async () => ({ rows: [] }),
        sourceAdd: async () => ({ sourceId: 'unused', realmId: 'unused' }),
        sourceList: async () => ({ rows: [] }),
        sourceRemove: async () => ({ sourceId: 'unused' }),
        acquireOwnership: () => {
          throw new PrototypeUnsupportedError()
        },
        loadDefinitions: async () => {
          loadedDefinitions = true
          throw new Error('definitions loaded without ownership')
        },
        open: async () => {
          throw new Error('direct dependencies opened without ownership')
        },
      },
    })

    expect(exit).toBe(50)
    expect(loadedDefinitions).toBe(false)
  } finally {
    error.mockRestore()
  }
})

test('direct Source add help releases ownership after generating dynamic options', async () => {
  const loaded = await loadCliDefinitions()
  const events: string[] = []
  const output = spyOn(console, 'log').mockImplementation(() => {})
  try {
    const exit = await runCli(['source', 'add', '--help'], {
      source: {
        selectDaemon: () => null,
        sourceDefinitions: async () => {
          throw new Error('daemon definitions requested')
        },
        sourceAdd: async () => {
          throw new Error('daemon add requested')
        },
        sourceList: async () => ({ rows: [] }),
        sourceRemove: async () => ({ sourceId: 'unused' }),
        acquireOwnership: () => {
          events.push('acquire-owner')
          return fakeOwnership(events)
        },
        loadDefinitions: async () => {
          events.push('load-definitions')
          return loaded
        },
        open: async () => {
          throw new Error('help opened dependencies')
        },
      },
    })

    expect(exit).toBe(0)
    expect(events).toEqual([
      'acquire-owner',
      'read-identities',
      'load-definitions',
      'close-owner',
    ])
  } finally {
    output.mockRestore()
  }
})

test('direct Source definition failure releases ownership', async () => {
  const events: string[] = []
  await expect(
    resolveSourceCommandRoute(['add', 'local.directory'], {
      selectDaemon: () => null,
      sourceDefinitions: async () => {
        throw new Error('daemon definitions requested')
      },
      sourceAdd: async () => ({ sourceId: 'unused', realmId: 'unused' }),
      sourceList: async () => ({ rows: [] }),
      sourceRemove: async () => ({ sourceId: 'unused' }),
      acquireOwnership: () => fakeOwnership(events),
      loadDefinitions: async () => {
        events.push('load-definitions')
        throw new Error('definition failure')
      },
      open: async () => {
        throw new Error('dependencies opened after definition failure')
      },
    }),
  ).rejects.toThrow('definition failure')
  expect(events).toEqual(['read-identities', 'load-definitions', 'close-owner'])
})

test('Source invocation cleanup releases ownership when Citty rejects a generated option', async () => {
  const loaded = await loadCliDefinitions()
  const events: string[] = []
  const error = spyOn(console, 'error').mockImplementation(() => {})
  try {
    const exit = await runCli(
      ['source', 'add', 'local.directory', '--config-unknown', 'value'],
      {
        source: {
          selectDaemon: () => null,
          sourceDefinitions: async () => {
            throw new Error('daemon definitions requested')
          },
          sourceAdd: async () => {
            throw new Error('daemon add requested')
          },
          sourceList: async () => ({ rows: [] }),
          sourceRemove: async () => ({ sourceId: 'unused' }),
          acquireOwnership: () => {
            events.push('acquire-owner')
            return fakeOwnership(events)
          },
          loadDefinitions: async () => {
            events.push('load-definitions')
            return loaded
          },
          open: async () => {
            events.push('compose-deps')
            throw new Error('invalid argv opened dependencies')
          },
        },
      },
    )

    expect(exit).not.toBe(0)
    expect(events).toEqual([
      'acquire-owner',
      'read-identities',
      'load-definitions',
      'close-owner',
    ])
  } finally {
    error.mockRestore()
  }
})

test('cleanup failures do not replace success and ownership release is independent', async () => {
  const loaded = await loadCliDefinitions()
  const events: string[] = []
  const output = spyOn(console, 'log').mockImplementation(() => {})
  try {
    const exit = await handleSourceCommand(['list'], {
      selectDaemon: () => null,
      sourceDefinitions: async () => ({ rows: [] }),
      sourceAdd: async () => ({ sourceId: 'unused', realmId: 'unused' }),
      sourceList: async () => ({ rows: [] }),
      sourceRemove: async () => ({ sourceId: 'unused' }),
      acquireOwnership: () =>
        ({
          readLocalOAuthAppIdentities: async () => [],
          close: () => {
            events.push('close-owner')
            throw new Error('owner cleanup failure')
          },
        }) as never,
      loadDefinitions: async () => loaded,
      open: async () =>
        ({
          registry: loaded.registry,
          sourceService: { listSources: () => [] },
          close: async () => {
            events.push('close-deps')
            throw new Error('deps cleanup failure')
          },
        }) as never,
    })
    expect(exit).toBe(0)
    expect(events).toEqual(['close-deps', 'close-owner'])
  } finally {
    output.mockRestore()
  }
})
