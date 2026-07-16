import type { ExtensionAuthoringHost } from '@ctxindex/extension-sdk'
import { TENDER_FIXTURES } from './fixtures'

export default function extension(host: ExtensionAuthoringHost) {
  const tenderSchema = host.z
    .object({
      reference: host.z.string().min(1),
      title: host.z.string().min(1),
      buyer: host.z.string().min(1),
      publishedAt: host.z.string().datetime(),
      deadline: host.z.string().datetime(),
      status: host.z.string().min(1),
      description: host.z.string().min(1),
    })
    .strict()

  const tenderProfile = host.defineProfile({
    id: 'enarocanje.tender',
    version: 1,
    schema: tenderSchema,
    search: {
      title: (payload) => payload.title,
      occurredAt: (payload) => new Date(payload.publishedAt),
      chunks: (payload) => [payload.description],
      fields: {
        reference: { type: 'string', extract: (payload) => payload.reference },
        buyer: { type: 'string', extract: (payload) => payload.buyer },
        status: { type: 'string', extract: (payload) => payload.status },
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
    docs: {
      summary: 'A public procurement tender.',
      aliases: ['tenders'],
    },
  })

  const tenderAdapter = host.defineAdapter({
    id: 'enarocanje.fixture',
    version: 1,
    configSchema: host.z.object({}).strict(),
    auth: { kind: 'none' },
    profiles: [{ id: 'enarocanje.tender', version: 1 }],
    routing: 'indexed',
    capabilities: ['sync'],
    operations: {
      sync: async (context) => {
        for (const payload of TENDER_FIXTURES) {
          await context.emit({
            type: 'upsertResource',
            resource: {
              ref: `ctx://${context.source.id}/tender/${encodeURIComponent(payload.reference)}`,
              profile: { id: 'enarocanje.tender', version: 1 },
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
    docs: { summary: 'Deterministic eNarocanje tender fixtures.' },
  })

  return host.defineExtension({
    id: 'enarocanje.proof',
    version: 1,
    profiles: [tenderProfile],
    adapters: [tenderAdapter],
    docs: { summary: 'External tenders Extension proof.' },
  })
}
