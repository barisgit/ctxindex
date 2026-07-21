import { afterEach, expect, spyOn, test } from 'bun:test'
import { runCommand } from 'citty'
import {
  defineCtxCommand,
  normalizeBuiltinFlagValues,
  prepareCommandTree,
  projectCommandReference,
  renderCommandUsage,
  validateCommandInvocation,
} from './command-model'

afterEach(() => {
  process.exitCode = 0
  spyOn(console, 'error').mockRestore()
})

test('passes Citty-inferred arguments to handlers from one definition', async () => {
  const received: unknown[] = []
  const leaf = defineCtxCommand({
    meta: { name: 'run', description: 'Run one fixture.' },
    args: {
      target: {
        type: 'positional',
        required: true,
        description: 'Exact target',
      },
      mode: {
        type: 'enum',
        options: ['fast', 'safe'],
        default: 'safe',
        description: 'Execution mode',
      },
      json: { type: 'boolean', description: 'Print JSON' },
    },
    run: ({ args }) => {
      received.push({ target: args.target, mode: args.mode, json: args.json })
    },
  })
  const root = defineCtxCommand({
    meta: { name: 'ctxindex', description: 'Fixture CLI', version: '1.0.0' },
    subCommands: {
      fixture: defineCtxCommand({
        meta: { name: 'fixture', description: 'Fixture operations.' },
        subCommands: { run: leaf },
      }),
    },
  })
  await prepareCommandTree(root)

  await runCommand(leaf, { rawArgs: ['subject', '--mode', 'fast', '--json'] })

  expect(received).toEqual([{ target: 'subject', mode: 'fast', json: true }])
})

test('collects explicitly repeatable string options without a second parser', async () => {
  const received: unknown[] = []
  const command = defineCtxCommand({
    meta: { name: 'search' },
    args: {
      realm: {
        type: 'string',
        multiple: true,
        alias: 'r',
        description: 'Exact Realm slug',
      },
    },
    run: ({ args }) => {
      received.push(args.realm)
    },
  })

  await runCommand(command, {
    rawArgs: ['--realm', 'work', '-r', 'personal'],
  })

  expect(received).toEqual([['work', 'personal']])
})

test('preserves hyphen-leading string values accepted by Citty', async () => {
  const received: unknown[] = []
  const command = defineCtxCommand({
    meta: { name: 'configure' },
    args: { count: { type: 'string', required: true } },
    run: ({ args }) => {
      received.push(args.count)
    },
  })

  await runCommand(command, { rawArgs: ['--count', '-2'] })

  expect(received).toEqual(['-2'])
})

test('protects built-in-looking values through resolved option definitions', async () => {
  const root = defineCtxCommand({
    meta: { name: 'ctxindex' },
    subCommands: {
      realm: defineCtxCommand({
        meta: { name: 'realm' },
        subCommands: {
          add: defineCtxCommand({
            meta: { name: 'add' },
            args: {
              name: { type: 'string' },
              json: { type: 'boolean' },
            },
          }),
        },
      }),
    },
  })

  expect(
    await normalizeBuiltinFlagValues(root, ['realm', 'add', '--name', '-h']),
  ).toEqual(['realm', 'add', '--name=-h'])
  expect(
    await normalizeBuiltinFlagValues(root, ['realm', 'add', '--json', '-h']),
  ).toEqual(['realm', 'add', '--json', '-h'])
})

test('rejects unknown options in their command segment before dispatch', async () => {
  const root = defineCtxCommand({
    meta: { name: 'ctxindex' },
    args: {
      'log-level': { type: 'enum', options: ['debug', 'info'] },
    },
    subCommands: {
      sync: defineCtxCommand({
        meta: { name: 'sync' },
        args: { json: { type: 'boolean' } },
      }),
    },
  })
  await prepareCommandTree(root)

  expect(await validateCommandInvocation(root, ['--wat', 'sync'])).toBe(
    'ctxindex: unknown option --wat',
  )
  expect(
    await validateCommandInvocation(root, [
      '--log-level',
      'debug',
      'sync',
      '--json',
    ]),
  ).toBeUndefined()
})

test('rejects an unknown command even when help is requested', async () => {
  const command = defineCtxCommand({
    meta: { name: 'ctxindex' },
    subCommands: {
      known: defineCtxCommand({ meta: { name: 'known' } }),
    },
  })
  await prepareCommandTree(command)

  await expect(
    validateCommandInvocation(command, ['definitely-not-a-command', '--help']),
  ).resolves.toBe('ctxindex: unknown command definitely-not-a-command')
})

test.each([
  [['subject', '--wat'], '--wat'],
  [['subject', '--json', '--json'], '--json'],
  [['subject', 'extra'], 'extra'],
] as const)('rejects invalid tokens generically before invoking the handler: %j', async (rawArgs, expected) => {
  const effects: string[] = []
  const error = spyOn(console, 'error').mockImplementation(() => {})
  const command = defineCtxCommand({
    meta: { name: 'run', description: 'Run one fixture.' },
    args: {
      target: { type: 'positional', required: true },
      mode: { type: 'enum', options: ['fast', 'safe'] },
      json: { type: 'boolean' },
    },
    run: () => {
      effects.push('ran')
    },
  })
  const root = defineCtxCommand({
    meta: { name: 'ctxindex', description: 'Fixture CLI' },
    subCommands: { run: command },
  })
  await prepareCommandTree(root)

  await runCommand(command, { rawArgs: [...rawArgs] })

  expect(process.exitCode).toBe(2)
  expect(effects).toEqual([])
  expect(error.mock.calls.flat().join(' ')).toContain('ctxindex run')
  expect(error.mock.calls.flat().join(' ')).toContain(expected)
})

test('retains Citty enum validation from the same command definition', async () => {
  const effects: string[] = []
  const command = defineCtxCommand({
    meta: { name: 'run', description: 'Run one fixture.' },
    args: {
      target: { type: 'positional', required: true },
      mode: { type: 'enum', options: ['fast', 'safe'] },
    },
    run: () => {
      effects.push('ran')
    },
  })

  await expect(
    runCommand(command, { rawArgs: ['subject', '--mode='] }),
  ).rejects.toThrow('Invalid value for argument:')
  expect(effects).toEqual([])
})

test('preserves undefined for an omitted optional constrained positional', async () => {
  const received: unknown[] = []
  const command = defineCtxCommand({
    meta: { name: 'describe' },
    args: {
      selector: {
        type: 'positional',
        required: false,
        options: ['profile', 'adapter', 'action'],
      },
    },
    run: ({ args }) => {
      const omitted: typeof args.selector = undefined
      expect(omitted).toBeUndefined()
      received.push(args.selector)
    },
  })

  await runCommand(command, { rawArgs: [] })

  expect(received).toEqual([undefined])
})

test('renders complete nested Citty help with one scoped root guidance block', async () => {
  const build = defineCtxCommand({
    meta: { name: 'build', description: 'Build a Catalog.' },
    args: {
      'package-root': {
        type: 'positional',
        required: true,
        description: 'Author package root',
      },
      mode: {
        type: 'enum',
        options: ['safe', 'fast'],
        default: 'safe',
        description: 'Build mode',
      },
      'no-refresh': {
        type: 'boolean',
        description: 'Use stored state',
      },
    },
  })
  const catalog = defineCtxCommand({
    meta: { name: 'catalog', description: 'Manage Catalogs.' },
    subCommands: { build },
  })
  const extension = defineCtxCommand({
    meta: { name: 'extension', description: 'Manage Extensions.' },
    promoteInRootHelp: true,
    subCommands: { catalog },
  })
  const root = defineCtxCommand({
    meta: { name: 'ctxindex', description: 'Fixture CLI', version: '1.0.0' },
    subCommands: { extension },
  })
  await prepareCommandTree(root)

  const nested = await renderCommandUsage(build)
  const rootUsage = await renderCommandUsage(root)

  expect(nested).toContain(
    'USAGE ctxindex extension catalog build [OPTIONS] <PACKAGE-ROOT>',
  )
  expect(nested).toContain('--mode=<safe|fast>')
  expect(nested).toContain('(Default: safe)')
  expect(nested).toContain('--no-refresh')
  expect(nested).not.toContain('INTERFACE')
  expect(rootUsage).toContain('INTERFACE')
})

test('projects the complete command reference from resolved definitions', async () => {
  const leaf = defineCtxCommand({
    meta: { name: 'run', description: 'Run one fixture.' },
    args: {
      target: {
        type: 'positional',
        required: true,
        description: 'Exact target',
      },
      mode: {
        type: 'enum',
        options: ['fast', 'safe'],
        default: 'safe',
        alias: 'm',
        description: 'Execution mode',
      },
    },
  })
  const root = defineCtxCommand({
    meta: { name: 'ctxindex', description: 'Fixture CLI' },
    subCommands: { run: leaf },
  })

  const projection = await projectCommandReference(root)

  expect(projection.commands.map(({ path }) => path.join(' '))).toEqual([
    'ctxindex',
    'ctxindex run',
  ])
  expect(projection.commands[1]).toMatchObject({
    description: 'Run one fixture.',
    arguments: [
      {
        name: 'target',
        type: 'positional',
        required: true,
        description: 'Exact target',
      },
      {
        name: 'mode',
        type: 'enum',
        required: false,
        defaultValue: 'safe',
        choices: ['fast', 'safe'],
        aliases: ['m'],
        description: 'Execution mode',
      },
    ],
  })
  expect(projection.commands[1]?.usage).toContain('ctxindex run')
})
