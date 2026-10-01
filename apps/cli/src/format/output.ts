import Table from 'cli-table3'

export const OUTPUT_FORMATS = ['pretty', 'text', 'json'] as const
export type OutputFormat = (typeof OUTPUT_FORMATS)[number]

export const outputFormatArg = {
  type: 'enum' as const,
  options: [...OUTPUT_FORMATS],
  alias: 'f',
  description: 'Output format: pretty, text, or json',
}

export const structuredOutputArgs = { format: outputFormatArg }

export interface OutputSelection {
  readonly format?: OutputFormat | undefined
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
  return selection.format ?? (environment.isTTY ? 'pretty' : 'text')
}

export interface OutputColumn {
  readonly key: string
  readonly label: string
  readonly align?: 'left' | 'center' | 'right'
}

type OutputRow = Readonly<Record<string, unknown>>

function escapeTerminalControls(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0
    const isControl =
      codePoint <= 0x08 ||
      codePoint === 0x0b ||
      codePoint === 0x0c ||
      (codePoint >= 0x0e && codePoint <= 0x1f) ||
      (codePoint >= 0x7f && codePoint <= 0x9f)
    return isControl
      ? `\\u${codePoint.toString(16).padStart(4, '0')}`
      : character
  }).join('')
}

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

function displayScalar(value: unknown): string {
  return escapeTerminalControls(
    scalar(value)
      .replaceAll('\r\n', '\n')
      .replaceAll('\r', '\n')
      .replaceAll('\t', '  '),
  )
}

export function escapeTsv(value: unknown): string {
  if (value === null || value === undefined) return '\\N'
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
        Bun.stringWidth(column.label),
        ...rows.map((row) =>
          Math.max(
            ...displayScalar(row[column.key])
              .split('\n')
              .map((line) => Bun.stringWidth(line)),
          ),
        ),
      )
      return total + width + 3
    }, 0)
  )
}

const tableStyle = { head: [] as string[], border: [] as string[] }
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

export function wrapDisplayText(value: string, maxWidth: number): string {
  const width = Math.max(2, Math.floor(maxWidth))
  return value
    .split('\n')
    .flatMap((sourceLine) => {
      if (sourceLine.length === 0) return ['']
      const lines: string[] = []
      let line = ''
      let lineWidth = 0
      for (const { segment } of graphemes.segment(sourceLine)) {
        const segmentWidth = Bun.stringWidth(segment)
        if (line.length > 0 && lineWidth + segmentWidth > width) {
          lines.push(line)
          line = ''
          lineWidth = 0
        }
        line += segment
        lineWidth += segmentWidth
      }
      lines.push(line)
      return lines
    })
    .join('\n')
}

function formatPlainCards(
  columns: readonly OutputColumn[],
  rows: readonly OutputRow[],
  available: number,
): string {
  return rows
    .map((row, index) => {
      const lines: string[] = []
      if (rows.length > 1)
        lines.push(wrapDisplayText(`Record ${index + 1}:`, available))
      for (const column of columns) {
        lines.push(wrapDisplayText(`${column.label}:`, available))
        lines.push(wrapDisplayText(displayScalar(row[column.key]), available))
      }
      return lines.join('\n')
    })
    .join('\n')
}

function formatCards(
  columns: readonly OutputColumn[],
  rows: readonly OutputRow[],
  available: number,
): string {
  if (available < 11) return formatPlainCards(columns, rows, available)
  const innerWidth = available - 3
  const widestLabel = Math.max(
    Bun.stringWidth('Record'),
    ...columns.map(({ label }) => Bun.stringWidth(label)),
  )
  const labelWidth = Math.min(
    widestLabel + 2,
    Math.max(4, Math.floor(innerWidth / 3)),
  )
  const valueWidth = innerWidth - labelWidth
  return rows
    .map((row, index) => {
      const table = new Table({
        colWidths: [labelWidth, valueWidth],
        wordWrap: false,
        style: tableStyle,
      })
      if (rows.length > 1)
        table.push([
          wrapDisplayText('Record', labelWidth - 2),
          wrapDisplayText(String(index + 1), valueWidth - 2),
        ])
      for (const column of columns)
        table.push([
          wrapDisplayText(column.label, labelWidth - 2),
          wrapDisplayText(displayScalar(row[column.key]), valueWidth - 2),
        ])
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
  const available = Math.max(2, Math.floor(environment.columns ?? 80))
  if (naturalTableWidth(columns, rows) > available)
    return formatCards(columns, rows, available)

  const table = new Table({
    head: columns.map(({ label }) => label),
    colAligns: columns.map(({ align }) => align ?? 'left'),
    style: tableStyle,
  })
  for (const row of rows)
    table.push(columns.map(({ key }) => displayScalar(row[key])))
  return table.toString()
}

export function formatPrettyRecord(
  fields: readonly OutputColumn[],
  row: OutputRow,
  environment: Pick<OutputEnvironment, 'columns'> = outputEnvironment(),
): string {
  return formatCards(
    fields,
    [row],
    Math.max(2, Math.floor(environment.columns ?? 80)),
  )
}

export function compactJson(value: unknown): string {
  return JSON.stringify(value)
}
