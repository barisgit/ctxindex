import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  DescribeActionResult,
  RunActionInput,
  RunActionResult,
} from '@ctxindex/core/action'
import {
  CtxindexAuthError,
  CtxindexError,
  CtxindexValidationError,
} from '@ctxindex/core/errors'
import { formatActionDescribeText, formatActionRunText } from '../format/action'
import {
  type ActionDeps,
  type ActionServices,
  handleActionCommand,
  parseActionInput,
} from './handle-action-command'

const actionId = 'fake.note.create'
const sourceId = 'source-a'
const described: DescribeActionResult = {
  id: actionId,
  profile: { id: 'fake.note', version: 1 },
  effect: 'reversible',
  input: { type: 'object' },
  output: { id: 'fake.note', version: 1 },
  adapters: [{ id: 'fake.adapter' }],
  sources: [
    {
      id: sourceId,
      adapter: { id: 'fake.adapter' },
      available: true,
    },
    {
      id: 'source-b',
      adapter: { id: 'missing.adapter' },
      available: false,
      reason: 'adapter_unavailable',
    },
  ],
}
const runResult = {
  resource: { ref: `ctx://${sourceId}/note/one`, title: 'Provider note' },
  warnings: [
    {
      code: 'profile_unavailable',
      message: 'raw warning',
      ref: `ctx://${sourceId}/note/one`,
    },
  ],
} as unknown as RunActionResult
const tempDirs: string[] = []

afterEach(async () => {
  spyOn(console, 'log').mockRestore()
  spyOn(console, 'error').mockRestore()
  for (const dir of tempDirs.splice(0))
    await rm(dir, { recursive: true, force: true })
})

describe('Action input', () => {
  test.each([
    ['{"body":"hello"}', { body: 'hello' }],
    ['[1,"two",null]', [1, 'two', null]],
    ['"value"', 'value'],
    ['42', 42],
    ['true', true],
    ['null', null],
  ])('returns arbitrary inline JSON unchanged: %s', async (input, expected) => {
    expect(await parseActionInput(input)).toEqual(expected)
  })

  test('falls back to the exact readable UTF-8 file path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ctxindex-action-'))
    tempDirs.push(dir)
    const path = join(dir, 'input.json')
    await writeFile(path, '["file",null]', 'utf8')
    expect(await parseActionInput(path)).toEqual(['file', null])
  })

  test('rejects syntactically invalid inline, unreadable, and invalid file input', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ctxindex-action-'))
    tempDirs.push(dir)
    const invalidPath = join(dir, 'invalid.json')
    await writeFile(invalidPath, '{bad json', 'utf8')

    for (const value of ['not-json-and-not-a-file', invalidPath]) {
      expect(
        await parseActionInput(value).catch((error) => error),
      ).toMatchObject({ code: 'invalid_action_input' })
    }
  })
})

describe('Action output', () => {
  test('formats compact describe text with all registry and Source facts', () => {
    expect(formatActionDescribeText(described)).toBe(
      [
        `id\t${actionId}`,
        'effect\treversible',
        'Profile\tfake.note@1',
        'output\tfake.note@1',
        'input\t{"type":"object"}',
        'Source\tsource-a\tavailable\tfake.adapter',
        'Source\tsource-b\tunavailable\tmissing.adapter\tadapter_unavailable',
      ].join('\n'),
    )
  })

  test('formats run text as Resource Ref and optional title', () => {
    expect(formatActionRunText(runResult)).toBe(
      `ctx://${sourceId}/note/one\tProvider note`,
    )
  })
})

describe('Action handler', () => {
  test('routes valid Action input through one selected daemon without opening direct dependencies', async () => {
    const log = spyOn(console, 'log').mockImplementation(() => {})
    let opened = 0
    let ensured = 0
    let received: unknown
    const selection = { endpoint: '/tmp/ctxindex-action.sock' } as never
    const services: ActionServices = {
      describe() {
        throw new Error('direct describe must not run')
      },
      async run() {
        throw new Error('direct run must not run')
      },
      ensureDaemonSelection: async () => {
        ensured += 1
        return {
          status: 'selected',
          selection,
          started: true,
        } as never
      },
      async daemonDescribe() {
        throw new Error('daemon describe must not run')
      },
      async daemonRun(selected, input) {
        expect(selected).toBe(selection)
        received = input
        return runResult as never
      },
    }

    expect(
      await handleActionCommand(
        {
          kind: 'run',
          actionId,
          sourceId,
          input: '{"body":"hi"}',
          json: true,
        },
        (async () => {
          opened += 1
          throw new Error('selected daemon must not open direct dependencies')
        }) as () => Promise<ActionDeps>,
        services,
      ),
    ).toBe(0)
    expect(ensured).toBe(1)
    expect(opened).toBe(0)
    expect(received).toEqual({
      actionId,
      source: sourceId,
      actionInput: { body: 'hi' },
      confirmIrreversible: false,
    })
    expect(log).toHaveBeenCalledWith(JSON.stringify(runResult))
  })

  test('routes an exact source-aware description through the selected daemon', async () => {
    const log = spyOn(console, 'log').mockImplementation(() => {})
    let received: unknown
    const services: ActionServices = {
      describe() {
        throw new Error('direct describe must not run')
      },
      async run() {
        throw new Error('direct run must not run')
      },
      ensureDaemonSelection: async () =>
        ({ status: 'selected', selection: {}, started: false }) as never,
      async daemonDescribe(_selection, input) {
        received = input
        return described as never
      },
      async daemonRun() {
        throw new Error('daemon run must not run')
      },
    }

    expect(
      await handleActionCommand(
        { kind: 'describe', actionId, sourceId, json: false },
        (async () => {
          throw new Error('selected daemon must not open direct dependencies')
        }) as () => Promise<ActionDeps>,
        services,
      ),
    ).toBe(0)
    expect(received).toEqual({ actionId, source: sourceId })
    expect(log).toHaveBeenCalledWith(formatActionDescribeText(described))
  })

  test('never falls back after a selected daemon Action failure', async () => {
    const error = spyOn(console, 'error').mockImplementation(() => {})
    let opened = 0
    const expected = new CtxindexAuthError('needs_auth', 'daemon auth failed')
    const services: ActionServices = {
      describe() {
        return described
      },
      async run() {
        return runResult
      },
      ensureDaemonSelection: async () =>
        ({ status: 'selected', selection: {}, started: false }) as never,
      async daemonDescribe() {
        return described as never
      },
      async daemonRun() {
        throw expected
      },
    }

    expect(
      await handleActionCommand(
        {
          kind: 'run',
          actionId,
          sourceId,
          input: '{}',
          json: false,
        },
        (async () => {
          opened += 1
          throw new Error('must not open')
        }) as () => Promise<ActionDeps>,
        services,
      ),
    ).toBe(10)
    expect(opened).toBe(0)
    expect(error).toHaveBeenCalledWith(expected.message)
  })

  test('rejects invalid Action input before ensuring a daemon', async () => {
    spyOn(console, 'error').mockImplementation(() => {})
    let ensured = 0
    const services = {
      describe() {
        return described
      },
      async run() {
        return runResult
      },
      ensureDaemonSelection: async () => {
        ensured += 1
        return { status: 'unsupported' as const }
      },
    }

    expect(
      await handleActionCommand(
        {
          kind: 'run',
          actionId,
          sourceId,
          input: 'missing-input-file.json',
          json: false,
        },
        async () => {
          throw new Error('invalid input must not open direct dependencies')
        },
        services,
      ),
    ).toBe(2)
    expect(ensured).toBe(0)
  })

  test('passes exact describe arguments, prints the full JSON result, and closes', async () => {
    const log = spyOn(console, 'log').mockImplementation(() => {})
    let closed = false
    let received: unknown
    const open = async () => ({
      db: {},
      registry: {},
      authService: {},
      logger: {},
      sourceService: { resolveSourceId: (reference: string) => reference },
      async close() {
        closed = true
      },
    })
    const services: ActionServices = {
      describe(input: unknown) {
        received = input
        return described
      },
      async run() {
        return runResult
      },
    }

    expect(
      await handleActionCommand(
        { kind: 'describe', actionId, sourceId, json: true },
        open as () => Promise<ActionDeps>,
        services as ActionServices,
      ),
    ).toBe(0)
    expect(received).toEqual({ db: {}, registry: {}, actionId, sourceId })
    expect(log).toHaveBeenCalledWith(JSON.stringify(described))
    expect(closed).toBe(true)
  })

  test('parses input before deps and propagates explicit Source, signal, output, warnings, and close', async () => {
    const log = spyOn(console, 'log').mockImplementation(() => {})
    const error = spyOn(console, 'error').mockImplementation(() => {})
    let opened = 0
    let closed = false
    let received: RunActionInput | undefined
    const open = async () => {
      opened += 1
      return {
        db: {},
        registry: {},
        authService: {},
        logger: {},
        sourceService: { resolveSourceId: (reference: string) => reference },
        async close() {
          closed = true
        },
      }
    }
    const services: ActionServices = {
      describe() {
        return described
      },
      async run(input: RunActionInput) {
        received = input
        return runResult
      },
      ensureDaemonSelection: async () => ({ status: 'unsupported' }),
    }

    expect(
      await handleActionCommand(
        {
          kind: 'run',
          actionId,
          sourceId,
          input: '{"body":"hi"}',
          json: false,
        },
        open as () => Promise<ActionDeps>,
        services as ActionServices,
      ),
    ).toBe(0)
    expect(opened).toBe(1)
    expect(received).toMatchObject({
      db: {},
      registry: {},
      authService: {},
      logger: {},
      actionId,
      sourceId,
      actionInput: { body: 'hi' },
      confirmIrreversible: false,
    })
    expect(received?.signal).toBeInstanceOf(AbortSignal)
    expect(log).toHaveBeenCalledWith(formatActionRunText(runResult))
    expect(error).toHaveBeenCalledWith('profile_unavailable\traw warning')
    expect(closed).toBe(true)
  })

  test.each([
    ['42', 42],
    ['[1,"two"]', [1, 'two']],
    ['null', null],
  ])('passes scalar, array, and null input unchanged to runAction: %s', async (raw, expected) => {
    spyOn(console, 'log').mockImplementation(() => {})
    let received: RunActionInput | undefined
    const open = async () => ({
      db: {},
      registry: {},
      authService: {},
      logger: {},
      sourceService: { resolveSourceId: (reference: string) => reference },
      async close() {},
    })
    const services: ActionServices = {
      describe() {
        return described
      },
      async run(input) {
        received = input
        return runResult
      },
    }

    expect(
      await handleActionCommand(
        {
          kind: 'run',
          actionId,
          sourceId,
          input: raw,
          json: false,
        },
        open as () => Promise<ActionDeps>,
        services,
      ),
    ).toBe(0)
    expect(received?.actionInput).toEqual(expected)
  })

  test('rejects unreadable and invalid files before opening dependencies', async () => {
    const error = spyOn(console, 'error').mockImplementation(() => {})
    const dir = await mkdtemp(join(tmpdir(), 'ctxindex-action-'))
    tempDirs.push(dir)
    const invalidPath = join(dir, 'invalid.json')
    await writeFile(invalidPath, '{bad json', 'utf8')
    let opens = 0
    const open = async () => {
      opens += 1
      throw new Error('must not open')
    }

    for (const input of ['missing-input-file.json', invalidPath]) {
      expect(
        await handleActionCommand(
          {
            kind: 'run',
            actionId,
            sourceId,
            input,
            json: false,
          },
          open as () => Promise<ActionDeps>,
        ),
      ).toBe(2)
    }
    expect(opens).toBe(0)
    expect(error).toHaveBeenCalled()
  })

  test.each([
    [new CtxindexValidationError('action_unsupported', 'unsupported'), 2],
    [new CtxindexValidationError('confirmation_required', 'confirm'), 2],
    [new CtxindexAuthError('needs_auth', 'auth'), 10],
    [new CtxindexError('bad result', 'invalid_action_result'), 50],
  ])('maps service errors and always closes', async (thrown, exit) => {
    spyOn(console, 'error').mockImplementation(() => {})
    let closed = false
    const open = async () => ({
      db: {},
      registry: {},
      authService: {},
      logger: {},
      sourceService: { resolveSourceId: (reference: string) => reference },
      async close() {
        closed = true
      },
    })
    const services: ActionServices = {
      describe() {
        throw thrown
      },
      async run() {
        throw thrown
      },
    }
    expect(
      await handleActionCommand(
        { kind: 'describe', actionId, json: false },
        open as () => Promise<ActionDeps>,
        services as ActionServices,
      ),
    ).toBe(exit)
    expect(closed).toBe(true)
  })
})
