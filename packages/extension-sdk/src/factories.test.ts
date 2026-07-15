import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import {
  type ActionContext,
  type ArtifactDescriptor,
  type DownloadContext,
  defineAdapter,
  defineExtension,
  defineProfile,
  type InferProfilePayload,
  type ResolvedArtifactDescriptor,
  type RetrievedResource,
  type SearchRemoteResource,
  type SearchRemoteResult,
} from './index'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
type Assert<T extends true> = T

const noteProfile = defineProfile({
  id: 'fake.note',
  version: 1,
  schema: z.object({ title: z.string(), pinned: z.boolean() }),
  search: {
    title: (payload) => payload.title,
    fields: {
      pinned: { type: 'boolean', extract: (payload) => payload.pinned },
    },
  },
  docs: { summary: 'A fake note', aliases: ['note'] },
})

const noteAdapter = defineAdapter({
  id: 'fake.notes',
  version: 1,
  configSchema: z.object({ root: z.string().describe('Notes root') }),
  auth: { kind: 'none' },
  profiles: [{ id: 'fake.note', version: 1 }],
  routing: 'indexed',
  capabilities: ['retrieve'],
  operations: { retrieve: async () => {} },
  actions: {},
})

defineAdapter({
  id: 'fake.remote-notes',
  version: 1,
  configSchema: z.object({}),
  auth: { kind: 'none' },
  profiles: [{ id: 'fake.note', version: 1 }],
  routing: 'federated',
  capabilities: ['search-remote'],
  operations: {
    searchRemote: async (context): Promise<SearchRemoteResult> => {
      const text: string = context.query.text
      const limit: number = context.query.limit
      const since: number | undefined = context.query.since
      const until: number | undefined = context.query.until
      const fields = context.query.fields
      const aborted: boolean = context.signal.aborted
      void since
      void until
      void fields
      void aborted
      return {
        resources: [
          {
            ref: `ctx://${context.source.id}/note/1`,
            profile: { id: 'fake.note', version: 1 },
            title: text,
            payload: { title: text, pinned: false },
          },
        ].slice(0, limit),
        warnings: [],
      }
    },
  },
  actions: {},
})

defineAdapter({
  id: 'fake.downloads',
  version: 1,
  configSchema: z.object({}),
  auth: { kind: 'none' },
  profiles: [{ id: 'fake.note', version: 1 }],
  routing: 'indexed',
  capabilities: ['download'],
  operations: {
    download: async (context) => {
      const artifact: ResolvedArtifactDescriptor = context.artifact
      const signal: AbortSignal = context.signal
      await context.write(new Uint8Array())
      void artifact
      void signal
    },
  },
  actions: {},
})

const descriptor: ArtifactDescriptor = {
  ref: 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/note/1/artifact/file',
  filename: 'file.txt',
  mediaType: 'text/plain',
  byteSize: 4,
}

const resolvedDescriptor: ResolvedArtifactDescriptor = {
  ...descriptor,
  originRef: 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/note/1',
}

const _DownloadIsAsyncCompatible: (
  context: DownloadContext,
) => void | Promise<void> = async () => {}
void resolvedDescriptor
void _DownloadIsAsyncCompatible

const actionResult: RetrievedResource = {
  ref: 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/note/1',
  profile: { id: 'fake.note', version: 1 },
  payload: { title: 'Action result', pinned: false },
}

defineAdapter({
  id: 'fake.actions',
  version: 1,
  configSchema: z.object({}),
  auth: { kind: 'none' },
  profiles: [{ id: 'fake.note', version: 1 }],
  routing: 'indexed',
  capabilities: [],
  operations: {},
  actions: {
    'fake.note.create': {
      profile: { id: 'fake.note', version: 1 },
      input: z.object({ title: z.string() }),
      output: { id: 'fake.note', version: 1 },
      run(context: ActionContext<{ title: string }>) {
        const sourceId: string = context.source.id
        const inputTitle: string = context.input.title
        const signal: AbortSignal = context.signal
        const fetch: typeof globalThis.fetch = context.fetch
        const logger = context.logger
        void sourceId
        void inputTitle
        void signal
        void fetch
        void logger
        return actionResult
      },
    },
  },
})

function assertActionContextIsCapabilitySpecific(
  context: ActionContext<{ title: string }>,
): void {
  // @ts-expect-error Action contexts do not expose retrieval emission
  context.emitResource
}
void assertActionContextIsCapabilitySpecific

defineAdapter({
  id: 'fake.missing-operation',
  version: 1,
  configSchema: z.object({}),
  auth: { kind: 'none' },
  profiles: [],
  routing: 'indexed',
  capabilities: ['retrieve'],
  // @ts-expect-error a declared capability requires its operation
  operations: {},
  actions: {},
})

defineAdapter({
  id: 'fake.forbidden-operation',
  version: 1,
  configSchema: z.object({}),
  auth: { kind: 'none' },
  profiles: [],
  routing: 'indexed',
  capabilities: [],
  operations: {
    // @ts-expect-error an omitted capability forbids its operation
    sync: async () => ({}),
  },
  actions: {},
})

defineAdapter({
  id: 'fake.capability-contexts',
  version: 1,
  configSchema: z.object({}),
  auth: { kind: 'none' },
  profiles: [],
  routing: 'indexed',
  capabilities: ['retrieve'],
  operations: {
    retrieve: (context) => {
      const ref: string = context.ref
      // @ts-expect-error retrieve does not receive sync cursor access
      context.cursor
      void ref
    },
  },
  actions: {},
})

const noteExtension = defineExtension({
  id: 'fake.notes',
  version: 1,
  profiles: [noteProfile],
  adapters: [noteAdapter],
})

type _ProfileIdInference = Assert<Equal<typeof noteProfile.id, 'fake.note'>>
type _ProfilePayloadInference = Assert<
  Equal<
    InferProfilePayload<typeof noteProfile>,
    { title: string; pinned: boolean }
  >
>
type _AdapterIdInference = Assert<Equal<typeof noteAdapter.id, 'fake.notes'>>
type _ExtensionIdInference = Assert<
  Equal<typeof noteExtension.id, 'fake.notes'>
>

describe('extension SDK definition factories', () => {
  test('return plain definitions without wrapping or mutation', () => {
    expect(noteProfile.id).toBe('fake.note')
    expect(noteAdapter.capabilities).toEqual(['retrieve'])
    expect(noteExtension.profiles[0]).toBe(noteProfile)
    expect(Object.getPrototypeOf(noteExtension)).toBe(Object.prototype)
  })

  test('has no runtime dependency on @ctxindex/core', async () => {
    const source = await readFile(`${import.meta.dir}/index.ts`, 'utf8')
    expect(source).not.toContain("from '@ctxindex/core")
    expect(source).not.toContain('from "@ctxindex/core')
  })

  test('remote search results are typed and scoreless', () => {
    const result = {
      resources: [],
      warnings: [],
      // @ts-expect-error provider results do not expose scores
      score: 1,
    } satisfies SearchRemoteResult
    const resource = {
      ref: 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/note/1',
      profile: { id: 'fake.note', version: 1 },
      // @ts-expect-error provider resources do not expose scores
      score: 1,
    } satisfies SearchRemoteResource
    expect(result.resources).toEqual([])
    expect(resource.ref).toContain('/note/1')
  })
})
