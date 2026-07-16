import { describe, expect, test } from 'bun:test'
import { type ActionArgs, parseActionArgs } from './action'

const id = 'fake.note.create'

describe('parseActionArgs', () => {
  test.each([
    [['describe', id], { kind: 'describe', actionId: id, json: false }],
    [
      ['describe', '--json', id, '--source=source-a'],
      { kind: 'describe', actionId: id, sourceId: 'source-a', json: true },
    ],
    [
      ['describe', '--source', 'source-a', id],
      { kind: 'describe', actionId: id, sourceId: 'source-a', json: false },
    ],
    [
      [
        'run',
        id,
        '--source=source-a',
        '--input={"body":"hi"}',
        '--json',
        '--confirm-irreversible',
      ],
      {
        kind: 'run',
        actionId: id,
        sourceId: 'source-a',
        input: '{"body":"hi"}',
        json: true,
        confirmIrreversible: true,
      },
    ],
    [
      ['run', '--input', 'input.json', '--source', 'source-a', id],
      {
        kind: 'run',
        actionId: id,
        sourceId: 'source-a',
        input: 'input.json',
        json: false,
        confirmIrreversible: false,
      },
    ],
    [
      ['run', id, '--source', '-source', '--input', '-input.json'],
      {
        kind: 'run',
        actionId: id,
        sourceId: '-source',
        input: '-input.json',
        json: false,
        confirmIrreversible: false,
      },
    ],
  ])('parses strict action arguments', (args, expected) => {
    expect(parseActionArgs(args)).toEqual(expected as ActionArgs)
  })

  test.each([
    [[], 'action: missing describe or run'],
    [['other', id], 'action: unknown subcommand: other'],
    [['describe'], 'action describe: missing <action-id>'],
    [
      ['describe', id, 'extra'],
      'action describe: expected exactly one <action-id>',
    ],
    [
      ['describe', id, '--input', '{}'],
      'action describe: unknown flag --input',
    ],
    [
      ['describe', id, '--confirm-irreversible'],
      'action describe: unknown flag --confirm-irreversible',
    ],
    [
      ['describe', id, '--source'],
      'action describe: --source requires a non-empty value',
    ],
    [
      ['describe', id, '--source='],
      'action describe: --source requires a non-empty value',
    ],
    [
      ['describe', id, '--source', 'a', '--source=b'],
      'action describe: duplicate --source',
    ],
    [['describe', id, '--wat'], 'action describe: unknown flag --wat'],
    [['describe', id, '-x'], 'action describe: unknown flag -x'],
    [['run'], 'action run: missing <action-id>'],
    [['run', id, '--input', '{}'], 'action run: missing --source'],
    [['run', id, '--source', 'a'], 'action run: missing --input'],
    [
      ['run', id, '--source=', '--input', '{}'],
      'action run: --source requires a non-empty value',
    ],
    [
      ['run', id, '--source', 'a', '--input='],
      'action run: --input requires a non-empty value',
    ],
    [
      ['run', id, '--source', 'a', '--source', 'b', '--input', '{}'],
      'action run: duplicate --source',
    ],
    [
      ['run', id, '--source', 'a', '--input', '{}', '--input', '{}'],
      'action run: duplicate --input',
    ],
    [
      ['run', id, '--source', 'a', '--input', '{}', '--wat'],
      'action run: unknown flag --wat',
    ],
    [
      ['run', id, '--source', 'a', '--input', '{}', 'extra'],
      'action run: expected exactly one <action-id>',
    ],
  ])('rejects invalid arguments: %j', (args, message) => {
    expect(parseActionArgs(args)).toEqual({ kind: 'unknown', message })
  })

  test.each([
    [['--help']],
    [['describe', '--help']],
    [['run', '-h']],
  ])('accepts help', (args) => {
    expect(parseActionArgs(args)).toEqual({ kind: 'help' })
  })
})
