import { CodeHighlight } from '@/components/code-highlight'

// Condensed from barisgit/ctxindex-extensions — real public-SDK code, not
// pseudocode or a privileged monorepo fixture.
const SDK_CODE = `import { auth, defineAdapter, defineExtension, defineProfile, defineProvider, z } from '@ctxindex/extension-sdk'

const issueProfile = defineProfile({
  id: 'software.issue',
  version: 1,
  schema: z.object({
    number: z.number().int().positive(),
    title: z.string().min(1),
    state: z.enum(['open', 'closed']),
    updatedAt: z.string().datetime(),
  }),
  search: {
    title: (payload) => payload.title,
    fields: {
      state: { type: 'string', extract: (payload) => payload.state },
      updatedAt: { type: 'datetime', extract: (payload) => new Date(payload.updatedAt) },
    },
  },
})

const github = defineProvider({ id: 'github.public', auth: auth.none() })

const issues = defineAdapter({
  id: 'github.issues',
  provider: github,
  providerApiHosts: ['api.github.com'],
  profiles: [issueProfile],
  routing: 'indexed',
  capabilities: ['sync'],
  operations: {
    sync: async (context) => {
      for (const payload of await fetchIssues(context)) {
        await context.emit({ type: 'upsertResource', resource: toResource(context, payload) })
      }
    },
  },
})

export default defineExtension({
  id: 'barisgit.github-issues',
  providers: [github],
  adapters: [issues],
})`

export function SdkExample() {
  return (
    <div className="overflow-hidden rounded-ctx-panel border border-[var(--ctx-terminal-muted)] bg-[var(--ctx-terminal)]">
      <div className="flex min-h-10 items-center border-b border-[var(--ctx-terminal-muted)] px-4 py-2 sm:px-6">
        <span className="font-mono text-[0.6875rem] text-[var(--ctx-terminal-muted-foreground)]">
          index.ts · condensed from github.com/barisgit/ctxindex-extensions
        </span>
      </div>
      <CodeHighlight code={SDK_CODE} lang="ts" className="px-5 py-5 sm:px-6" />
    </div>
  )
}
