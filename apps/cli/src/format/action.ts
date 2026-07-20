import type {
  DescribeActionResult,
  RunActionResult,
} from '@ctxindex/core/action'

export function formatActionDescribeText(result: DescribeActionResult): string {
  return [
    `id\t${result.id}`,
    `effect\t${result.effect}`,
    `Profile\t${result.profile.id}@${result.profile.version}`,
    `output\t${result.output.id}@${result.output.version}`,
    `input\t${JSON.stringify(result.input)}`,
    ...result.sources.map(
      (source) =>
        `Source\t${source.id}\t${source.available ? 'available' : 'unavailable'}\t${source.adapter.id}${source.reason ? `\t${source.reason}` : ''}`,
    ),
  ].join('\n')
}

export function formatActionRunText(result: RunActionResult): string {
  return `${result.resource.ref}${result.resource.title ? `\t${result.resource.title}` : ''}`
}
