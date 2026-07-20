import type {
  RegistryDescription,
  SourceDescription,
} from '@ctxindex/core/registry'

import type { RegistryView } from './registry-projection'
import {
  json,
  prettyJson,
  record,
  schemaConstraints,
  schemaType,
  unrenderedSchema,
} from './registry-schema'

function markdownCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function formatObjectInputMarkdown(schema: Record<string, unknown>): string[] {
  const properties = schema ? record(schema.properties) : undefined
  if (schema.type !== 'object' || !properties)
    return ['```json', prettyJson(schema), '```']
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter(
          (item): item is string => typeof item === 'string',
        )
      : [],
  )
  const lines = [
    '| Field | Type | Required | Constraints |',
    '| --- | --- | --- | --- |',
  ]
  if (typeof schema.title === 'string') lines.unshift(`**${schema.title}**`, '')
  if (typeof schema.description === 'string')
    lines.unshift(schema.description, '')
  for (const [name, value] of Object.entries(properties)) {
    const property = record(value)
    const constraints = property
      ? schemaConstraints(property)
      : [`schema fragment: ${json(value)}`]
    const remainder = property ? unrenderedSchema(property) : undefined
    if (remainder) constraints.push(`schema fragment: ${json(remainder)}`)
    lines.push(
      `| \`${markdownCell(name)}\` | \`${property ? markdownCell(schemaType(property)) : 'unknown'}\` | ${required.has(name) ? 'yes' : 'no'} | ${markdownCell(constraints.join('; '))} |`,
    )
  }
  if (schema.additionalProperties === false)
    lines.push('', 'Additional properties are not allowed.')
  else if (schema.additionalProperties === true)
    lines.push('', 'Additional properties are allowed.')
  else if (record(schema.additionalProperties))
    lines.push(
      '',
      `Additional properties must match \`<${schemaType(record(schema.additionalProperties) as Record<string, unknown>)}>\`.`,
    )
  const remainder = unrenderedSchema(schema, [
    'properties',
    'required',
    'additionalProperties',
  ])
  if (remainder)
    lines.push('', `Unrendered schema fragment: \`${json(remainder)}\``)
  return lines
}

function formatInputMarkdown(input: object): string[] {
  const schema = record(input)
  if (!schema) return ['```json', prettyJson(input), '```']
  const alternatives = Array.isArray(schema.oneOf)
    ? schema.oneOf
    : Array.isArray(schema.anyOf)
      ? schema.anyOf
      : undefined
  if (!alternatives) return formatObjectInputMarkdown(schema)
  return alternatives.flatMap((value, index) => {
    const alternative = record(value)
    return [
      `##### Branch ${index + 1}`,
      '',
      ...(alternative
        ? formatObjectInputMarkdown(alternative)
        : ['```json', prettyJson(value), '```']),
      '',
    ]
  })
}

function markdownStringValues(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function formatProviderMarkdown(source: SourceDescription): string[] {
  if (!source.provider) return ['- Provider: none']
  const auth = record(source.provider.auth)
  const lines = [`- Provider: ${source.provider.id}`]
  if (auth && typeof auth.kind === 'string') lines.push(`- Auth: ${auth.kind}`)
  if (auth && typeof auth.authorizationUrl === 'string')
    lines.push(`- Authorization URL: ${auth.authorizationUrl}`)
  if (auth && typeof auth.tokenUrl === 'string')
    lines.push(`- Token URL: ${auth.tokenUrl}`)
  const authHosts = markdownStringValues(auth?.allowedHosts)
  if (authHosts.length > 0) lines.push(`- Auth hosts: ${authHosts.join(', ')}`)
  const baseScopes = markdownStringValues(auth?.baseScopes)
  if (baseScopes.length > 0)
    lines.push(`- Provider base scopes: ${baseScopes.join(', ')}`)
  const registration = record(auth?.registration)
  const environment = record(registration?.environment)
  if (environment) {
    const values = Object.entries(environment)
      .filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      )
      .map(([field, name]) => `${field}=\`${name}\``)
    if (values.length > 0) lines.push(`- Environment: ${values.join(', ')}`)
  }
  if (source.access)
    lines.push(`- Adapter scopes: ${source.access.scopes.join(', ') || 'none'}`)
  if (source.providerApiHosts.length > 0)
    lines.push(`- Provider API hosts: ${source.providerApiHosts.join(', ')}`)
  return lines
}

function formatCompactRegistryMarkdown(
  description: RegistryDescription,
): string {
  const lines = ['# ctxindex Registry', '']
  if (description.kinds.length > 0) {
    lines.push(`## Profiles (${description.kinds.length})`, '')
    for (const kind of description.kinds)
      lines.push(`- \`${kind.id}@${kind.version}\``)
    lines.push('')
  }
  if (description.sources.length > 0) {
    lines.push(`## Adapters (${description.sources.length})`, '')
    for (const source of description.sources) lines.push(`- \`${source.id}\``)
    lines.push('')
  }
  if (description.actions.length > 0) {
    lines.push(`## Actions (${description.actions.length})`, '')
    for (const action of description.actions)
      lines.push(
        `- \`${action.id}\` — ${action.profile.id}@${action.profile.version}, ${action.effect}`,
      )
    lines.push('')
  }
  lines.push(
    'Use `ctxindex describe <profile|adapter|action> <id>` for full details.',
    '',
    'Use `ctxindex describe --full` for the complete loaded interface.',
  )
  return lines.join('\n')
}

export function formatRegistryMarkdown(
  description: RegistryDescription,
  view: RegistryView = 'full',
): string {
  if (view === 'compact') return formatCompactRegistryMarkdown(description)
  const lines = ['# ctxindex Registry', '']
  if (description.kinds.length > 0) {
    lines.push('## Profiles', '')
    for (const kind of description.kinds) {
      lines.push(`### ${kind.id}@${kind.version}`)
      lines.push(
        `- Fields: ${kind.fields.map((field) => `\`${field.name}\` (${field.type})`).join(', ') || 'none'}`,
      )
      lines.push(
        `- Formats: ${kind.formats.map((format) => `\`${format.name}\` (${format.mediaType})`).join(', ') || 'none'}`,
        '',
      )
    }
  }
  if (description.sources.length > 0) {
    lines.push('## Adapters', '')
    for (const source of description.sources) {
      lines.push(`### ${source.id}`)
      lines.push(
        '',
        `- Profiles: ${source.profiles.map((profile) => `${profile.id}@${profile.version}`).join(', ') || 'none'}`,
      )
      lines.push(
        `- Routing: ${source.routing}`,
        ...formatProviderMarkdown(source),
      )
      lines.push(`- Capabilities: ${source.capabilities.join(', ') || 'none'}`)
      lines.push(
        `- Config flags: ${source.configOptions.map((option) => `\`${option.flag}\` (${option.type}${option.required ? ', required' : ''}${option.default !== undefined ? `, default ${json(option.default)}` : ''})`).join(', ') || 'none'}`,
        '',
      )
    }
  }
  if (description.actions.length > 0) {
    lines.push('## Actions', '')
    for (const action of description.actions) {
      lines.push(`### ${action.id}`)
      lines.push(
        '',
        `- Profile: ${action.profile.id}@${action.profile.version}`,
        `- Effect: ${action.effect}`,
      )
      lines.push('', '#### Input', '', ...formatInputMarkdown(action.input), '')
      lines.push(`- Output: ${action.output.id}@${action.output.version}`)
      lines.push(
        `- Adapter bindings: ${action.adapters.map((adapter) => adapter.id).join(', ') || 'none'}`,
        '',
      )
    }
  }
  return lines.join('\n').trimEnd()
}
