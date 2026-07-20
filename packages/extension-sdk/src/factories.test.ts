import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import {
  type ActionContext,
  type ArtifactDescriptor,
  auth,
  type DownloadContext,
  defineAdapter,
  defineExtension,
  defineProfile,
  defineProvider,
  type InferProfilePayload,
  type ResolvedArtifactDescriptor,
  type RetrievedResource,
  type SearchRemoteResource,
  type SearchRemoteResult,
  type SyncEmission,
  z,
} from './index'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
type Assert<T extends true> = T

const oauthProvider = defineProvider({
  id: 'fake',
  auth: auth.oauth2({
    authorizationUrl: 'https://auth.example.com/authorize',
    tokenUrl: 'https://auth.example.com/token',
    identity: {
      url: 'https://api.example.com/userinfo',
      subjectPath: ['sub'],
      labelPaths: [['email'], ['name']],
      identities: [
        { kind: 'email', path: ['email'], verifiedPath: ['email_verified'] },
      ],
    },
    pkce: { method: 'S256', required: true },
    registration: {
      type: 'public',
      configSchema: z.object({
        clientId: z.string(),
        clientSecret: z.string().optional(),
      }),
      environment: {
        clientId: 'CTXINDEX_FAKE_CLIENT_ID',
        clientSecret: 'CTXINDEX_FAKE_CLIENT_SECRET',
      },
    },
    baseScopes: ['openid', 'email'],
    allowedHosts: ['api.example.com', 'auth.example.com'],
    fixedAuthorizationParams: { prompt: 'consent' },
  }),
})
const localProvider = defineProvider({ id: 'local', auth: auth.none() })

const oauthAdapter = defineAdapter({
  id: 'fake.oauth',
  configSchema: z.object({}),
  provider: oauthProvider,
  access: { scopes: ['fake.read'] },
  providerApiHosts: ['api.example.com'],
  profiles: [],
  routing: 'federated',
  capabilities: ['search-remote'],
  operations: { searchRemote: async () => ({ resources: [], warnings: [] }) },
  actions: {},
})

type OAuthAuthInference = Assert<
  Equal<
    typeof oauthAdapter.provider.auth.registration,
    {
      readonly type: 'public'
      readonly configSchema: z.ZodObject<{
        clientId: z.ZodString
        clientSecret: z.ZodOptional<z.ZodString>
      }>
      readonly environment: {
        readonly clientId: 'CTXINDEX_FAKE_CLIENT_ID'
        readonly clientSecret: 'CTXINDEX_FAKE_CLIENT_SECRET'
      }
    }
  >
>
const oauthAuthInferenceCompiles: OAuthAuthInference = true
void oauthAuthInferenceCompiles
void oauthAdapter

const noteProfile = defineProfile({
  id: 'fake.note',
  version: 1,
  schema: z.object({ title: z.string(), pinned: z.boolean() }),
  search: {
    title: (payload) => payload.title,
    summary: (payload) => (payload.pinned ? 'Pinned note' : null),
    fields: {
      pinned: { type: 'boolean', extract: (payload) => payload.pinned },
    },
  },
})

const noteAdapter = defineAdapter({
  id: 'fake.notes',
  configSchema: z.object({ root: z.string().describe('Notes root') }),
  provider: localProvider,
  profiles: [noteProfile],
  routing: 'indexed',
  capabilities: ['retrieve'],
  operations: { retrieve: async () => {} },
  actions: {},
})

defineAdapter({
  id: 'fake.remote-notes',
  configSchema: z.object({}),
  provider: localProvider,
  profiles: [noteProfile],
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
  configSchema: z.object({}),
  provider: localProvider,
  profiles: [noteProfile],
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

defineAdapter({
  id: 'fake.sync',
  configSchema: z.object({}),
  provider: localProvider,
  profiles: [noteProfile],
  routing: 'indexed',
  capabilities: ['sync'],
  operations: {
    sync: async (context) => {
      const mode: 'sync' | 'resync' | 'diff' = context.mode
      const emission: SyncEmission = {
        type: 'upsertResource',
        resource: {
          ref: `ctx://${context.source.id}/note/1`,
          profile: { id: 'fake.note', version: 1 },
          completeness: 'complete',
          payload: { title: 'Synced', pinned: false },
        },
      }
      await context.emit(emission)
      // @ts-expect-error sync only accepts the public generic emission union
      await context.emit({ type: 'upsertItem', itemId: 'legacy' })
      void mode
    },
  },
  actions: {},
})

defineAdapter({
  id: 'fake.sync-return',
  configSchema: z.object({}),
  provider: localProvider,
  profiles: [],
  routing: 'indexed',
  capabilities: ['sync'],
  operations: {
    // @ts-expect-error sync operations do not return result objects
    sync: async () => ({ legacy: true }),
  },
  actions: {},
})

const actionResult: RetrievedResource = {
  ref: 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/note/1',
  profile: { id: 'fake.note', version: 1 },
  payload: { title: 'Action result', pinned: false },
}

defineAdapter({
  id: 'fake.actions',
  configSchema: z.object({}),
  provider: localProvider,
  profiles: [noteProfile],
  routing: 'indexed',
  capabilities: [],
  operations: {},
  actions: {
    'fake.note.create': {
      profile: noteProfile,
      input: z.object({ title: z.string() }),
      output: noteProfile,
      run(context: ActionContext<{ title: string }>) {
        const sourceId: string = context.source.id
        const inputTitle: string = context.input.title
        const signal: AbortSignal = context.signal
        const fetch: typeof globalThis.fetch = context.fetch
        const logger = context.logger
        const resolved = context.resolveResource(
          'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/note/1',
        )
        const artifact = context.resolveArtifact(
          'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/note/1/attachment/1',
        )
        void sourceId
        void inputTitle
        void signal
        void fetch
        void logger
        void resolved
        void artifact
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
  configSchema: z.object({}),
  provider: localProvider,
  profiles: [],
  routing: 'indexed',
  capabilities: ['retrieve'],
  // @ts-expect-error a declared capability requires its operation
  operations: {},
  actions: {},
})

defineAdapter({
  id: 'fake.forbidden-operation',
  configSchema: z.object({}),
  provider: localProvider,
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
  configSchema: z.object({}),
  provider: localProvider,
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
  test('return fresh plain definitions without mutating imported values', () => {
    expect(noteProfile.id).toBe('fake.note')
    expect(noteProfile.kind).toBe('profile')
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
