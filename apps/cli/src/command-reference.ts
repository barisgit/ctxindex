import { stripVTControlCharacters } from 'node:util'
import type {
  CommandReferenceArgument,
  CommandReferenceProjection,
} from './command-model'

function escapeTable(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function argumentName(argument: CommandReferenceArgument): string {
  if (argument.type === 'positional') return `\`<${argument.name}>\``
  const names = [
    `\`--${argument.name}\``,
    ...(argument.aliases ?? []).map((alias) => `\`-${alias}\``),
  ]
  return names.join(', ')
}

function argumentDetails(argument: CommandReferenceArgument): string {
  return [
    argument.required ? 'Required' : 'Optional',
    argument.multiple ? 'Repeatable' : undefined,
    argument.choices === undefined
      ? undefined
      : `Choices: ${argument.choices.map((choice) => `\`${choice}\``).join(', ')}`,
    argument.defaultValue === undefined
      ? undefined
      : `Default: \`${String(argument.defaultValue)}\``,
  ]
    .filter((value): value is string => value !== undefined)
    .join('. ')
}

function argumentRows(
  argument: CommandReferenceArgument,
): readonly CommandReferenceArgument[] {
  if (argument.negativeName === undefined) return [argument]
  return [
    argument,
    {
      name: argument.negativeName,
      type: 'boolean',
      required: false,
      multiple: false,
      description:
        argument.negativeDescription ??
        `Disable ${argument.description ?? `--${argument.name}`}`,
    },
  ]
}

export function renderCommandReferenceMarkdown(
  projection: CommandReferenceProjection,
): string {
  const sections = projection.commands.map((command) => {
    const path = command.path.join(' ')
    const argumentsTable =
      command.arguments.length === 0
        ? ''
        : [
            '',
            '| Argument | Description | Contract |',
            '| --- | --- | --- |',
            ...command.arguments.flatMap((argument) =>
              argumentRows(argument).map((row) =>
                [
                  escapeTable(argumentName(row)),
                  escapeTable(row.description ?? ''),
                  escapeTable(argumentDetails(row)),
                ]
                  .join(' | ')
                  .replace(/^/, '| ')
                  .replace(/$/, ' |'),
              ),
            ),
          ].join('\n')
    return [
      `## \`${path}\``,
      '',
      command.description ?? '',
      '',
      '```text',
      stripVTControlCharacters(command.usage)
        .trim()
        .split('\n')
        .map((line) => line.trimEnd())
        .join('\n'),
      '```',
      argumentsTable,
    ]
      .filter((line, index, lines) => line !== '' || lines[index - 1] !== '')
      .join('\n')
      .trim()
  })

  return [
    '---',
    'title: CLI reference',
    'description: Generated command and option reference for ctxindex.',
    '---',
    '',
    '{/* Generated from the Citty command tree. Do not edit by hand. */}',
    '',
    'The command tree below is generated from the same definitions used for parsing and `--help`. For task-oriented workflows, use the guides and examples instead.',
    '',
    ...sections.flatMap((section) => [section, '']),
  ].join('\n')
}
