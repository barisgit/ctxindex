import Table from 'cli-table3'

export const OUTPUT_FORMATS = ['pretty', 'text', 'json'] as const
export type OutputFormat = (typeof OUTPUT_FORMATS)[number]

export const structuredOutputArgs = {
  format: {
    type: 'enum' as const,
    options: [...OUTPUT_FORMATS],
    description: 'Output format: pretty, text, or json',
  },
  json: {
    type: 'boolean' as const,
    description: 'Shorthand for --format json',
  },
}

export interface OutputSelection {
  readonly format?: OutputFormat | undefined
  readonly json?: boolean | undefined
}

export interface OutputEnvironment {
  readonly isTTY: boolean
  readonly columns?: number
}

export function outputEnvironment(): OutputEnvironment {
  return {
    isTTY: process.stdout.isTTY === true,
    ...(process.stdout.columns === undefined
      ? {}
      : { columns: process.stdout.columns }),
  }
}

export function resolveOutputFormat(
  selection: OutputSelection,
  environment: OutputEnvironment = outputEnvironment(),
): OutputFormat {
  if (selection.json === true && selection.format !== undefined) {
    throw Object.assign(new Error('cannot combine --json with --format'), {
      code: 'invalid_args',
    })
  }
  if (selection.json === true) return 'json'
  return selection.format ?? (environment.isTTY ? 'pretty' : 'text')
}

export interface OutputColumn {
  readonly key: string
  readonly label: string
  readonly align?: 'left' | 'center' | 'right'
}

type OutputRow = Readonly<Record<string, unknown>>

function scalar(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'string') return value
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  )
    return String(value)
  return JSON.stringify(value)
}

export function escapeTsv(value: unknown): string {
  return scalar(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('\t', '\\t')
    .replaceAll('\r', '\\r')
    .replaceAll('\n', '\\n')
}

export function formatTsv(
  columns: readonly OutputColumn[],
  rows: readonly OutputRow[],
): string {
  return [
    columns.map(({ key }) => escapeTsv(key)).join('\t'),
    ...rows.map((row) =>
      columns.map(({ key }) => escapeTsv(row[key])).join('\t'),
    ),
  ].join('\n')
}

function naturalTableWidth(
  columns: readonly OutputColumn[],
  rows: readonly OutputRow[],
): number {
  return (
    1 +
    columns.reduce((total, column) => {
      const width = Math.max(
        column.label.length,
        ...rows.map((row) => scalar(row[column.key]).length),
      )
      return total + width + 3
    }, 0)
  )
}

const tableStyle = { head: [] as string[], border: [] as string[] }

function formatCards(
  columns: readonly OutputColumn[],
  rows: readonly OutputRow[],
): string {
  return rows
    .map((row, index) => {
      const table = new Table({ style: tableStyle })
      if (rows.length > 1) table.push(['Record', String(index + 1)])
      for (const column of columns)
        table.push([column.label, scalar(row[column.key])])
      return table.toString()
    })
    .join('\n')
}

export function formatPrettyCollection(
  columns: readonly OutputColumn[],
  rows: readonly OutputRow[],
  environment: Pick<OutputEnvironment, 'columns'> = outputEnvironment(),
): string {
  if (rows.length === 0) return ''
  const available = environment.columns ?? 80
  if (naturalTableWidth(columns, rows) > available)
    return formatCards(columns, rows)

  const table = new Table({
    head: columns.map(({ label }) => label),
    colAligns: columns.map(({ align }) => align ?? 'left'),
    style: tableStyle,
  })
  for (const row of rows) table.push(columns.map(({ key }) => scalar(row[key])))
  return table.toString()
}

export function formatPrettyRecord(
  fields: readonly OutputColumn[],
  row: OutputRow,
): string {
  return formatCards(fields, [row])
}

export function compactJson(value: unknown): string {
  return JSON.stringify(value)
}
