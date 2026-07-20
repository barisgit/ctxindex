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
        ['describe', actionId, '--source', sourceId, '--json'],
        open as () => Promise<ActionDeps>,
        services as ActionServices,
      ),
    ).toBe(0)
    expect(received).toEqual({ db: {}, registry: {}, actionId, sourceId })
    expect(log).toHaveBeenCalledWith(JSON.stringify(described))
    expect(closed).toBe(true)
  })

  test('parses input before deps and propagates explicit Source, confirmation, signal, output, warnings, and close', async () => {
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
    }

    expect(
      await handleActionCommand(
        [
          'run',
          actionId,
          '--source',
          sourceId,
          '--input',
          '{"body":"hi"}',
          '--confirm-irreversible',
        ],
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
      confirmIrreversible: true,
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
        ['run', actionId, '--source', sourceId, '--input', raw],
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
          ['run', actionId, '--source', sourceId, '--input', input],
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
        ['describe', actionId],
        open as () => Promise<ActionDeps>,
        services as ActionServices,
      ),
    ).toBe(exit)
    expect(closed).toBe(true)
  })
})
