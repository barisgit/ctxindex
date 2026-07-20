import { afterEach, expect, spyOn, test } from 'bun:test'
import { handleRealmCommand } from './realm'

afterEach(() => {
  process.removeAllListeners('SIGINT')
})

test('selected daemon handles Realm add without opening direct dependencies', async () => {
  const output: string[] = []
  const log = spyOn(console, 'log').mockImplementation((value) => {
    output.push(String(value))
  })
  let opened = false
  try {
    const exit = await handleRealmCommand(['add', 'work', '--name', 'Work'], {
      selectDaemon: () => ({}) as never,
      realmAdd: async (_selection, input) => {
        expect(input).toEqual({ slug: 'work', displayName: 'Work' })
        return { realmId: 'work' }
      },
      realmList: async () => ({ rows: [] }),
      open: async () => {
        opened = true
        throw new Error('direct dependencies opened')
      },
    })

    expect(exit).toBe(0)
    expect(opened).toBe(false)
    expect(output).toEqual(['realm added: work'])
  } finally {
    log.mockRestore()
  }
})

test('selected daemon handles Realm list with unchanged JSON formatting', async () => {
  const output: string[] = []
  const log = spyOn(console, 'log').mockImplementation((value) => {
    output.push(String(value))
  })
  try {
    const exit = await handleRealmCommand(['list', '--json'], {
      selectDaemon: () => ({}) as never,
      realmAdd: async () => ({ realmId: 'unused' }),
      realmList: async () => ({
        rows: [{ id: 'work', slug: 'work', label: 'Work', created_at: 1 }],
      }),
      open: async () => {
        throw new Error('direct dependencies opened')
      },
    })

    expect(exit).toBe(0)
    expect(JSON.parse(output[0] ?? '')).toEqual([
      { id: 'work', slug: 'work', label: 'Work', createdAt: 1 },
    ])
  } finally {
    log.mockRestore()
  }
})
