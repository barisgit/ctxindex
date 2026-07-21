import { CodeHighlight } from '@/components/code-highlight'

// Condensed from examples/tenders-extension/extension.ts — real, runnable SDK
// surface, not pseudocode.
const SDK_CODE = `import { defineAdapter, defineExtension, defineProfile, docs, z } from '@ctxindex/extension-sdk'

const tenderProfile = defineProfile({
  id: 'ctxindex.demo.tender',
  version: 1,
  schema: z.object({
    reference: z.string().min(1),
    title: z.string().min(1),
    buyer: z.string().min(1),
    deadline: z.string().datetime(),
    status: z.enum(['open', 'planned', 'awarded', 'cancelled']),
    estimatedValue: z.number().nonnegative(),
  }),
  search: {
    title: (payload) => payload.title,
    fields: {
      status: { type: 'string', extract: (payload) => payload.status },
      deadline: { type: 'datetime', extract: (payload) => new Date(payload.deadline) },
    },
  },
})

const tenderAdapter = defineAdapter({
  id: 'ctxindex.demo.tenders',
  profiles: [tenderProfile],
  routing: 'indexed',
  capabilities: ['sync'],
  operations: {
    sync: async (context) => {
      for (const payload of await fetchTenders()) {
        await context.emit({ type: 'upsertResource', resource: toResource(context, payload) })
      }
    },
  },
})

export default defineExtension({
  id: 'ctxindex.demo',
  adapters: [tenderAdapter],
  docs: docs('./docs'),
})`

export function SdkExample() {
  return (
    <div className="overflow-hidden rounded-ctx-panel border border-[var(--ctx-terminal-muted)] bg-[var(--ctx-terminal)]">
      <div className="flex min-h-10 items-center border-b border-[var(--ctx-terminal-muted)] px-4 py-2 sm:px-6">
        <span className="font-mono text-[0.6875rem] text-[var(--ctx-terminal-muted-foreground)]">
          extension.ts · condensed from the demo Extension in this repo
        </span>
      </div>
      <CodeHighlight code={SDK_CODE} lang="ts" className="px-5 py-5 sm:px-6" />
    </div>
  )
}
