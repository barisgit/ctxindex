import type { RegistryDescription } from '@ctxindex/core/registry'

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

function formatInputMarkdown(input: object): string[] {
  const schema = record(input)
  const properties = schema ? record(schema.properties) : undefined
  if (!schema || schema.type !== 'object' || !properties)
    return ['```json', prettyJson(input), '```']
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

function formatAuthMarkdown(auth: object): string[] {
  const value = record(auth)
  if (!value || typeof value.kind !== 'string')
    return [`- Auth: \`${json(auth)}\``]
  const lines = [`- Auth: ${value.kind}`]
  const provider = record(value.provider)
  if (provider) {
    if (typeof provider.authUrl === 'string')
      lines.push(`- Authorization URL: ${provider.authUrl}`)
    if (typeof provider.tokenUrl === 'string')
      lines.push(`- Token URL: ${provider.tokenUrl}`)
  }
  if (Array.isArray(value.scopes))
    lines.push(
      `- Scopes: ${value.scopes.filter((scope): scope is string => typeof scope === 'string').join(', ') || 'none'}`,
    )
  return lines
}

function formatCompactRegistryMarkdown(
  description: RegistryDescription,
): string {
  const lines = ['# ctxindex Registry', '']
  if (description.kinds.length > 0) {
    lines.push(`## Profiles (${description.kinds.length})`, '')
    for (const kind of description.kinds)
      lines.push(
        `- \`${kind.id}@${kind.version}\`${kind.summary ? ` — ${kind.summary}` : ''}`,
      )
    lines.push('')
  }
  if (description.sources.length > 0) {
    lines.push(`## Adapters (${description.sources.length})`, '')
    for (const source of description.sources)
      lines.push(
        `- \`${source.id}@${source.version}\`${source.summary ? ` — ${source.summary}` : ''}`,
      )
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
      lines.push(`### ${kind.id}@${kind.version}`, '', kind.summary ?? '')
      lines.push('', `- Aliases: ${kind.aliases.join(', ') || 'none'}`)
      lines.push(
        `- Fields: ${kind.fields.map((field) => `\`${field.name}\` (${field.type})${field.docs ? ` — ${field.docs}` : ''}`).join(', ') || 'none'}`,
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
      lines.push(`### ${source.id}@${source.version}`, '', source.summary ?? '')
      lines.push(
        '',
        `- Profiles: ${source.profiles.map((profile) => `${profile.id}@${profile.version}`).join(', ') || 'none'}`,
      )
      lines.push(
        `- Routing: ${source.routing}`,
        ...formatAuthMarkdown(source.auth),
      )
      lines.push(`- Capabilities: ${source.capabilities.join(', ') || 'none'}`)
      lines.push(
        `- Config flags: ${source.configOptions.map((option) => `\`${option.flag}\` (${option.type}${option.required ? ', required' : ''}${option.docs ? `, ${option.docs}` : ''}${option.default !== undefined ? `, default ${json(option.default)}` : ''})`).join(', ') || 'none'}`,
        '',
      )
    }
  }
  if (description.actions.length > 0) {
    lines.push('## Actions', '')
    for (const action of description.actions) {
      lines.push(`### ${action.id}`, '', action.docs)
      lines.push(
        '',
        `- Profile: ${action.profile.id}@${action.profile.version}`,
        `- Effect: ${action.effect}`,
      )
      lines.push('', '#### Input', '', ...formatInputMarkdown(action.input), '')
      lines.push(`- Output: ${action.output.id}@${action.output.version}`)
      lines.push(
        `- Adapter bindings: ${action.adapters.map((adapter) => `${adapter.id}@${adapter.version}`).join(', ') || 'none'}`,
        '',
        '#### Examples',
        '',
        '```json',
        prettyJson(action.examples),
        '```',
        '',
      )
    }
  }
  return lines.join('\n').trimEnd()
}
