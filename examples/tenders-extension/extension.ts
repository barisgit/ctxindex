import {
  defineAdapter,
  defineExtension,
  defineProfile,
  docs,
  z,
} from '@ctxindex/extension-sdk'
import { TENDER_FIXTURES } from './fixtures'

export const tenderSchema = z
  .object({
    reference: z.string().min(1),
    title: z.string().min(1),
    buyer: z.string().min(1),
    publishedAt: z.string().datetime(),
    deadline: z.string().datetime(),
    status: z.enum(['open', 'planned', 'awarded', 'cancelled']),
    category: z.string().min(1),
    currency: z.literal('EUR'),
    estimatedValue: z.number().nonnegative(),
    description: z.string().min(1),
  })
  .strict()

export const tenderProfile = defineProfile({
  id: 'ctxindex.demo.tender',
  version: 1,
  schema: tenderSchema,
  search: {
    title: (payload) => payload.title,
    occurredAt: (payload) => new Date(payload.publishedAt),
    chunks: (payload) => [
      payload.description,
      `${payload.buyer} ${payload.category}`,
    ],
    fields: {
      reference: { type: 'string', extract: (payload) => payload.reference },
      buyer: { type: 'string', extract: (payload) => payload.buyer },
      status: { type: 'string', extract: (payload) => payload.status },
      category: { type: 'string', extract: (payload) => payload.category },
      estimatedValue: {
        type: 'number',
        extract: (payload) => payload.estimatedValue,
      },
      deadline: {
        type: 'datetime',
        extract: (payload) => new Date(payload.deadline),
      },
      publishedAt: {
        type: 'datetime',
        extract: (payload) => new Date(payload.publishedAt),
      },
    },
  },
})

export const tenderAdapter = defineAdapter({
  id: 'ctxindex.demo.tenders',
  configSchema: z.object({}).strict(),
  profiles: [tenderProfile],
  routing: 'indexed',
  capabilities: ['sync'],
  operations: {
    sync: async (context) => {
      for (const payload of TENDER_FIXTURES) {
        await context.emit({
          type: 'upsertResource',
          resource: {
            ref: `ctx://${context.source.id}/tender/${encodeURIComponent(payload.reference)}`,
            profile: { id: tenderProfile.id, version: tenderProfile.version },
            completeness: 'complete',
            title: payload.title,
            summary: payload.description,
            occurredAt: Date.parse(payload.publishedAt),
            providerUpdatedAt: Date.parse(payload.publishedAt),
            payload,
          },
        })
      }
      await context.emit({
        type: 'checkpoint',
        cursor: {
          version: 1,
          references: TENDER_FIXTURES.map(({ reference }) => reference),
        },
      })
    },
  },
  actions: {},
})

const extension = defineExtension({
  id: 'ctxindex.demo',
  adapters: [tenderAdapter],
  docs: docs('./docs'),
})

export default extension
