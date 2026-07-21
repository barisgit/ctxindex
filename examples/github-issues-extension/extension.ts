import {
  auth,
  defineAdapter,
  defineExtension,
  defineProfile,
  defineProvider,
  docs,
  syncError,
  z,
} from '@ctxindex/extension-sdk'

export const GITHUB_API_VERSION = '2022-11-28'
export const GITHUB_ISSUES_MAX_PAGES = 100
export const GITHUB_ISSUES_MAX_ITEMS = 10_000

const githubOwner = z
  .string()
  .min(1)
  .max(39)
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/)
const githubRepository = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_.-]+$/)
  .refine((value) => value !== '.' && value !== '..')

export const githubIssuesConfigSchema = z
  .object({ owner: githubOwner, repository: githubRepository })
  .strict()

export const softwareIssueSchema = z
  .object({
    number: z.number().int().positive(),
    title: z.string().min(1),
    body: z.string().nullable(),
    state: z.enum(['open', 'closed']),
    labels: z.array(z.string().min(1)),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    closedAt: z.string().datetime().nullable(),
    url: z.string().url(),
  })
  .strict()

export const softwareIssueProfile = defineProfile({
  id: 'software.issue',
  version: 1,
  schema: softwareIssueSchema,
  search: {
    title: (issue) => issue.title,
    summary: (issue) => issue.body ?? issue.title,
    occurredAt: (issue) => new Date(issue.updatedAt),
    chunks: (issue) => [issue.body ?? issue.title, ...issue.labels],
    fields: {
      number: { type: 'number', extract: (issue) => issue.number },
      state: { type: 'string', extract: (issue) => issue.state },
      labels: { type: 'string[]', extract: (issue) => issue.labels },
      createdAt: {
        type: 'datetime',
        extract: (issue) => new Date(issue.createdAt),
      },
      updatedAt: {
        type: 'datetime',
        extract: (issue) => new Date(issue.updatedAt),
      },
      closedAt: {
        type: 'datetime',
        extract: (issue) =>
          issue.closedAt === null ? null : new Date(issue.closedAt),
      },
    },
  },
})

export const githubPublicProvider = defineProvider({
  id: 'github.public',
  auth: auth.none(),
})

const githubLabelSchema = z.union([
  z.string(),
  z.object({ name: z.string().nullable() }),
])

const githubIssueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  body: z.string().nullable(),
  state: z.enum(['open', 'closed']),
  labels: z.array(githubLabelSchema),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  closed_at: z.string().datetime().nullable(),
  html_url: z.string().url(),
  pull_request: z.unknown().optional(),
})

const githubIssuesPageSchema = z.array(githubIssueSchema)
const etagSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((value) =>
    [...value].every((character) => {
      const codePoint = character.codePointAt(0)
      return codePoint !== undefined && codePoint >= 0x20 && codePoint !== 0x7f
    }),
  )
const cursorSchema = z
  .object({
    version: z.literal(1),
    issueNumbers: z.array(z.number().int().positive()),
    pages: z.number().int().positive().max(GITHUB_ISSUES_MAX_PAGES),
    etag: etagSchema.optional(),
  })
  .strict()
  .refine(
    ({ issueNumbers }) =>
      issueNumbers.every((number, index) => {
        const previous = issueNumbers.at(index - 1)
        return index === 0 || (previous !== undefined && previous < number)
      }),
    'issueNumbers must be sorted and unique',
  )
  .refine(
    ({ pages, etag }) => etag === undefined || pages === 1,
    'etag is valid only for a one-page snapshot',
  )

type Config = z.infer<typeof githubIssuesConfigSchema>
type Cursor = z.infer<typeof cursorSchema>
type SoftwareIssue = z.infer<typeof softwareIssueSchema>

function collectionUrl(config: Config): URL {
  const url = new URL(
    `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repository)}/issues`,
    'https://api.github.com',
  )
  url.searchParams.set('state', 'all')
  url.searchParams.set('sort', 'updated')
  url.searchParams.set('direction', 'desc')
  url.searchParams.set('per_page', '100')
  return url
}

function parseCursor(value: unknown | null): Cursor | null {
  if (value === null) return null
  const parsed = cursorSchema.safeParse(value)
  if (!parsed.success) throw new Error('Invalid github.issues sync cursor')
  return parsed.data
}

function normalizedLabels(
  labels: z.infer<typeof githubIssueSchema>['labels'],
): string[] {
  return Array.from(
    new Set(
      labels.flatMap((label) => {
        const name = typeof label === 'string' ? label : label.name
        return name === null || name.length === 0 ? [] : [name]
      }),
    ),
  ).sort()
}

function normalizeIssue(
  issue: z.infer<typeof githubIssueSchema>,
): SoftwareIssue {
  return softwareIssueSchema.parse({
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    labels: normalizedLabels(issue.labels),
    createdAt: new Date(issue.created_at).toISOString(),
    updatedAt: new Date(issue.updated_at).toISOString(),
    closedAt:
      issue.closed_at === null ? null : new Date(issue.closed_at).toISOString(),
    url: issue.html_url,
  })
}

function splitLinkHeader(value: string): string[] {
  const segments: string[] = []
  let start = 0
  let insideTarget = false
  let insideQuote = false
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character === '<' && !insideQuote) insideTarget = true
    else if (character === '>' && !insideQuote) insideTarget = false
    else if (character === '"' && !insideTarget) insideQuote = !insideQuote
    else if (character === ',' && !insideTarget && !insideQuote) {
      segments.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  if (insideTarget || insideQuote)
    throw new Error('Malformed GitHub Link header')
  segments.push(value.slice(start).trim())
  if (segments.some((segment) => segment.length === 0)) {
    throw new Error('Malformed GitHub Link header')
  }
  return segments
}

function relation(segment: string): { target: string; rel: string } {
  const match = /^<([^<>]+)>((?:\s*;\s*[^;]+)+)$/.exec(segment)
  const target = match?.[1]
  const parameterText = match?.[2]
  if (target === undefined || parameterText === undefined) {
    throw new Error('Malformed GitHub Link header')
  }
  const parameters = parameterText
    .split(';')
    .slice(1)
    .map((value) => value.trim())
  let rel: string | undefined
  for (const parameter of parameters) {
    const parsed = /^([A-Za-z][A-Za-z0-9_-]*)=(?:"([^"]*)"|([^"\s]+))$/.exec(
      parameter,
    )
    if (!parsed) throw new Error('Malformed GitHub Link header')
    if (parsed[1]?.toLowerCase() !== 'rel') continue
    if (rel !== undefined) throw new Error('Ambiguous GitHub Link relation')
    const value = parsed[2] ?? parsed[3]
    if (value === undefined) throw new Error('Malformed GitHub Link header')
    rel = value
  }
  if (rel === undefined) throw new Error('GitHub Link relation is missing rel')
  return { target, rel }
}

function exactQuery(url: URL): boolean {
  const entries = [...url.searchParams.entries()]
  if (entries.length !== 5) return false
  const expected = new Map([
    ['state', 'all'],
    ['sort', 'updated'],
    ['direction', 'desc'],
    ['per_page', '100'],
  ])
  for (const [key, value] of expected) {
    if (url.searchParams.getAll(key).length !== 1) return false
    if (url.searchParams.get(key) !== value) return false
  }
  return url.searchParams.getAll('page').length === 1
}

function validatedNextUrl(
  link: string | null,
  canonical: URL,
  currentPage: number,
  seenPages: ReadonlySet<number>,
): URL | null {
  if (link === null) return null
  const relations = splitLinkHeader(link).map(relation)
  if (
    relations.some(
      ({ rel }) => rel !== 'next' && rel.split(/\s+/).includes('next'),
    )
  ) {
    throw new Error('GitHub next pagination relation must be exact')
  }
  const nextRelations = relations.filter(({ rel }) => rel === 'next')
  if (nextRelations.length === 0) return null
  if (nextRelations.length !== 1) {
    throw new Error('Ambiguous GitHub next pagination relation')
  }
  const target = nextRelations[0]?.target
  if (target === undefined) {
    throw new Error('GitHub next pagination relation is missing')
  }
  let url: URL
  try {
    url = new URL(target)
  } catch (cause) {
    throw new Error('Malformed GitHub next pagination URL', { cause })
  }
  const pageText = url.searchParams.get('page')
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'api.github.com' ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    url.hash !== '' ||
    url.pathname !== canonical.pathname ||
    !exactQuery(url) ||
    pageText === null ||
    !/^[1-9][0-9]*$/.test(pageText)
  ) {
    throw new Error('Unsafe GitHub next pagination URL')
  }
  const page = Number(pageText)
  if (
    !Number.isSafeInteger(page) ||
    page <= currentPage ||
    seenPages.has(page)
  ) {
    throw new Error('GitHub pagination did not advance')
  }
  return url
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch (cause) {
    throw new Error('GitHub Issues returned malformed JSON', { cause })
  }
}

export const githubIssuesAdapter = defineAdapter({
  id: 'github.issues',
  provider: githubPublicProvider,
  providerApiHosts: ['api.github.com'],
  configSchema: githubIssuesConfigSchema,
  profiles: [softwareIssueProfile],
  routing: 'indexed',
  capabilities: ['sync'],
  operations: {
    sync: async (context) => {
      const config = githubIssuesConfigSchema.parse(context.source.config)
      const cursor = parseCursor(context.cursor)
      const canonical = collectionUrl(config)
      const baseHeaders = new Headers({
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ctxindex-github-issues-demo/1',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      })

      const issues = new Map<number, SoftwareIssue>()
      const seenPages = new Set<number>([1])
      let pages = 0
      let url: URL | null = canonical
      let firstPageEtag: string | undefined
      while (url !== null) {
        context.signal.throwIfAborted()
        if (pages >= GITHUB_ISSUES_MAX_PAGES) {
          throw new Error('GitHub Issues pagination page limit reached')
        }
        const headers = new Headers(baseHeaders)
        if (pages === 0 && cursor?.etag !== undefined) {
          headers.set('If-None-Match', cursor.etag)
        }
        let response: Response
        try {
          response = await context.fetch(url, {
            headers,
            signal: context.signal,
          })
        } catch {
          context.signal.throwIfAborted()
          throw syncError('network', 'GitHub Issues network request failed.')
        }
        context.signal.throwIfAborted()
        pages += 1
        if (response.status === 304) {
          if (pages !== 1 || cursor?.etag === undefined) {
            throw new Error('Unexpected GitHub Issues 304 response')
          }
          await context.emit({ type: 'checkpoint', cursor })
          return
        }
        if (!response.ok) {
          const message = `GitHub Issues request failed with HTTP ${response.status}.`
          if (response.status === 429) {
            const retryAfter = response.headers.get('retry-after')
            const retryAfterMs =
              retryAfter !== null && /^\d+$/.test(retryAfter)
                ? Number(retryAfter) * 1_000
                : undefined
            throw syncError(
              'rate_limited',
              message,
              retryAfterMs !== undefined && retryAfterMs <= 60_000
                ? { retryAfterMs }
                : {},
            )
          }
          throw syncError(
            response.status >= 500
              ? 'provider_unavailable'
              : 'provider_bad_response',
            message,
          )
        }
        const parsed = githubIssuesPageSchema.safeParse(
          await responseJson(response),
        )
        if (!parsed.success) {
          throw new Error('GitHub Issues returned an invalid response schema')
        }
        for (const item of parsed.data) {
          if (item.pull_request !== undefined) continue
          if (issues.has(item.number)) {
            throw new Error(
              `GitHub Issues returned duplicate issue ${item.number}`,
            )
          }
          if (issues.size >= GITHUB_ISSUES_MAX_ITEMS) {
            throw new Error('GitHub Issues item limit reached')
          }
          issues.set(item.number, normalizeIssue(item))
        }
        if (pages === 1) {
          const candidate = response.headers.get('etag')
          if (candidate !== null) {
            const parsedEtag = etagSchema.safeParse(candidate)
            if (!parsedEtag.success) {
              throw new Error('GitHub Issues returned an invalid ETag')
            }
            firstPageEtag = parsedEtag.data
          }
        }
        const currentPage =
          pages === 1 ? 1 : Number(url.searchParams.get('page'))
        const next = validatedNextUrl(
          response.headers.get('link'),
          canonical,
          currentPage,
          seenPages,
        )
        if (next !== null) {
          const nextPage = Number(next.searchParams.get('page'))
          seenPages.add(nextPage)
          if (pages >= GITHUB_ISSUES_MAX_PAGES) {
            throw new Error('GitHub Issues pagination page limit reached')
          }
        }
        url = next
      }

      context.signal.throwIfAborted()
      const ordered = [...issues.values()].sort(
        (left, right) => left.number - right.number,
      )
      const issueNumbers = ordered.map(({ number }) => number)
      for (const issue of ordered) {
        await context.emit({
          type: 'upsertResource',
          resource: {
            ref: `ctx://${context.source.id}/issue/${issue.number}`,
            profile: {
              id: softwareIssueProfile.id,
              version: softwareIssueProfile.version,
            },
            completeness: 'complete',
            title: issue.title,
            summary: issue.body ?? issue.title,
            occurredAt: Date.parse(issue.updatedAt),
            providerUpdatedAt: Date.parse(issue.updatedAt),
            payload: issue,
          },
        })
      }
      const present = new Set(issueNumbers)
      for (const previous of cursor?.issueNumbers ?? []) {
        if (!present.has(previous)) {
          await context.emit({
            type: 'removeResource',
            ref: `ctx://${context.source.id}/issue/${previous}`,
          })
        }
      }
      await context.emit({
        type: 'checkpoint',
        cursor: {
          version: 1,
          issueNumbers,
          pages,
          ...(pages === 1 && firstPageEtag !== undefined
            ? { etag: firstPageEtag }
            : {}),
        },
      })
    },
  },
  actions: {},
})

export default defineExtension({
  id: 'ctxindex.github-issues-demo',
  adapters: [githubIssuesAdapter],
  docs: docs('./docs'),
})
