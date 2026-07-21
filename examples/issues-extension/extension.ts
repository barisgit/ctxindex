import {
  auth,
  defineAdapter,
  defineExtension,
  defineOAuthApp,
  defineProfile,
  defineProvider,
  docs,
  z,
} from '@ctxindex/extension-sdk'

export const issueSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    state: z.enum(['open', 'closed']),
    updatedAt: z.string().datetime(),
  })
  .strict()

const issueSearchResponseSchema = z
  .object({
    items: z.array(issueSchema),
    continuation: z.string().min(1).optional(),
  })
  .strict()

export const issueProfile = defineProfile({
  id: 'example.issue',
  version: 1,
  schema: issueSchema,
  search: {
    title: (issue) => issue.title,
    occurredAt: (issue) => new Date(issue.updatedAt),
    fields: {
      state: { type: 'string', extract: (issue) => issue.state },
    },
  },
})

export const projectProvider = defineProvider({
  id: 'example.projects',
  auth: auth.oauth2({
    authorizationUrl: 'https://auth.example.invalid/authorize',
    tokenUrl: 'https://auth.example.invalid/token',
    identity: {
      url: 'https://api.example.invalid/me',
      subjectPath: ['id'],
      labelPaths: [['email']],
      identities: [{ kind: 'email', path: ['email'] }],
    },
    pkce: { method: 'S256', required: true },
    registration: {
      type: 'public',
      configSchema: z.object({ clientId: z.string().min(1) }).strict(),
      environment: { clientId: 'EXAMPLE_PROJECTS_CLIENT_ID' },
    },
    baseScopes: ['openid', 'email'],
    allowedHosts: ['auth.example.invalid', 'api.example.invalid'],
  }),
})

export const desktopApp = defineOAuthApp(projectProvider, {
  label: 'desktop',
  config: { clientId: 'example-public-client-id' },
})

export const issueAdapter = defineAdapter({
  id: 'example.issues',
  provider: projectProvider,
  access: { scopes: ['issues.read'] },
  providerApiHosts: ['api.example.invalid'],
  configSchema: z.object({ project: z.string().min(1) }).strict(),
  profiles: [issueProfile],
  routing: 'federated',
  capabilities: ['search-remote'],
  operations: {
    searchRemote: async (context) => {
      const config = z
        .object({ project: z.string().min(1) })
        .strict()
        .parse(context.source.config)
      const url = new URL(
        `/projects/${encodeURIComponent(config.project)}/issues`,
        'https://api.example.invalid',
      )
      url.searchParams.set('q', context.query.text)
      url.searchParams.set('limit', String(context.query.limit))
      if (context.query.continuation) {
        url.searchParams.set('cursor', context.query.continuation)
      }

      const response = await context.fetch(url, { signal: context.signal })
      if (!response.ok)
        throw new Error(`Issue search failed: ${response.status}`)
      const result = issueSearchResponseSchema.parse(await response.json())

      return {
        resources: result.items.map((issue) => ({
          ref: `ctx://${context.source.id}/issue/${encodeURIComponent(issue.id)}`,
          profile: { id: issueProfile.id, version: issueProfile.version },
          title: issue.title,
          occurredAt: Date.parse(issue.updatedAt),
          payload: issue,
        })),
        warnings: [],
        ...(result.continuation === undefined
          ? {}
          : { continuation: result.continuation }),
      }
    },
  },
  actions: {},
})

export default defineExtension({
  id: 'example.issues',
  oauthApps: [desktopApp],
  adapters: [issueAdapter],
  docs: docs('./docs'),
})
