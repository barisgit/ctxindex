import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import {
  defineRpcFailureRegistry,
  rpcAccountAddEventSchema,
  rpcAccountAddInputSchema,
  rpcAccountListResultSchema,
  rpcAccountRespondInputSchema,
  rpcActionDescribeInputSchema,
  rpcActionDescribeResultSchema,
  rpcActionRunInputSchema,
  rpcActionRunResultSchema,
  rpcByteTransferDescriptorSchema,
  rpcArtifactListInputSchema,
  rpcArtifactListResultSchema,
  rpcArtifactPurgeInputSchema,
  rpcArtifactPurgeResultSchema,
  rpcDocumentationGetInputSchema,
  rpcDocumentationGetResultSchema,
  rpcDocumentationListInputSchema,
  rpcDocumentationListResultSchema,
  rpcDocumentationSearchInputSchema,
  rpcDocumentationSearchResultSchema,
  rpcExportInputSchema,
  rpcExportResultSchema,
  rpcFailureSchema,
  rpcHealthResultSchema,
  rpcJsonCursorSchema,
  rpcJsonDefaultSchema,
  rpcOAuthAppAddInputSchema,
  rpcOAuthAppListResultSchema,
  rpcOAuthAppRegistrationResultSchema,
  rpcProtocolIdentitySchema,
  rpcRealmAddInputSchema,
  rpcRealmListResultSchema,
  rpcResourceGetInputSchema,
  rpcResourceGetResultSchema,
  rpcResultSchema,
  rpcRuntimeIdentitySchema,
  rpcSafeJsonSchema,
  rpcSearchInputSchema,
  rpcSearchResultSchema,
  rpcSecretsBackendSetInputSchema,
  rpcSecretsBackendSetResultSchema,
  rpcSecretsStatusResultSchema,
  rpcShutdownAcceptedSchema,
  rpcSourceAddInputSchema,
  rpcSourceListResultSchema,
  rpcSourceRemoveInputSchema,
  rpcStatusInputSchema,
  rpcStatusResultSchema,
  rpcSyncEventSchema,
  rpcSyncInputSchema,
  rpcSyncResultSchema,
  rpcThreadGetInputSchema,
  rpcThreadGetResultSchema,
  rpcTransportContextSchema,
} from './schemas'

test('failure registry derives kind from its key and rejects a repeated kind', () => {
  const registry = defineRpcFailureRegistry({
    mismatch: {
      message: 'bounded',
      data: {
        // @ts-expect-error failure kind is derived from the registry key
        kind: z.literal('different'),
      },
    },
  })
  expect(registry.mismatch.data.parse({ kind: 'mismatch' })).toEqual({
    kind: 'mismatch',
  })
})

const digest = 'a'.repeat(64)
const protocol = { id: 'ctxindex.local', version: 1 } as const
const runtime = {
  tupleDigest: digest,
  configDigest: digest,
  dataDigest: digest,
  stateDigest: digest,
  cacheDigest: digest,
  databaseDigest: digest,
} as const
const warning = { code: 'warning', message: 'safe warning' }
const run = {
  runId: 'run-id',
  mode: 'sync',
  status: 'completed',
  added: 0,
  updated: 0,
  deleted: 0,
  warningsCount: 0,
  errorsCount: 0,
  lastWarning: null,
  warnings: [],
} as const
const sourceId = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const ref = `ctx://${sourceId}/item/one`
const resource = {
  id: 'resource-id',
  ref,
  sourceId,
  realmId: 'work',
  profile: { id: 'example.item', version: 1 },
  origin: 'synced',
  title: 'One',
  summary: null,
  occurredAt: null,
  providerUpdatedAt: null,
  deletedAt: null,
  hydratedAt: 1,
  payload: { nested: [null, true, 1.5, 'text'] },
  createdAt: 1,
  updatedAt: 1,
} as const

describe('wire identity and common bounds', () => {
  test('accepts exact protocol/runtime identities and rejects unknown keys', () => {
    expect(rpcProtocolIdentitySchema.parse(protocol)).toEqual(protocol)
    expect(rpcRuntimeIdentitySchema.parse(runtime)).toEqual(runtime)
    expect(() =>
      rpcProtocolIdentitySchema.parse({ ...protocol, extra: true }),
    ).toThrow()
    expect(() =>
      rpcProtocolIdentitySchema.parse({ ...protocol, version: 0 }),
    ).toThrow()
    expect(() =>
      rpcProtocolIdentitySchema.parse({ ...protocol, version: 65_536 }),
    ).toThrow()
    expect(() =>
      rpcRuntimeIdentitySchema.parse({
        ...runtime,
        tupleDigest: 'A'.repeat(64),
      }),
    ).toThrow()
  })

  test('validated transport context excludes AbortSignal', () => {
    const transport = {
      requestId: 'request-id',
      clientProtocol: protocol,
      clientRuntime: runtime,
    }
    expect(rpcTransportContextSchema.parse(transport)).toEqual(transport)
    expect(() =>
      rpcTransportContextSchema.parse({
        ...transport,
        signal: new AbortController().signal,
      }),
    ).toThrow()
  })

  test('enforces UTF-8 byte bounds rather than code-unit bounds', () => {
    expect(() =>
      rpcSyncInputSchema.parse({ mode: 'sync', source: 'é'.repeat(65) }),
    ).toThrow()
    expect(() =>
      rpcFailureSchema.parse({
        kind: 'ctxindex',
        taxonomy: 'other',
        code: 'code',
        message: 'é'.repeat(257),
      }),
    ).toThrow()
    expect(() =>
      rpcSyncInputSchema.parse({ mode: 'sync', source: '\ud800' }),
    ).toThrow()
  })

  test('requires a closed ctxindex failure taxonomy', () => {
    const failure = {
      kind: 'ctxindex',
      taxonomy: 'sync',
      code: 'not_found',
      message: 'The daemon could not complete the request.',
    } as const
    expect(rpcFailureSchema.parse(failure)).toEqual(failure)
    const { taxonomy: _taxonomy, ...missing } = failure
    expect(() => rpcFailureSchema.parse(missing)).toThrow()
    expect(() =>
      rpcFailureSchema.parse({ ...failure, taxonomy: 'provider' }),
    ).toThrow()
  })

  test('rejects invalid counts, timestamps, versions, and timeout bounds', () => {
    expect(() =>
      rpcHealthResultSchema.parse({
        protocol,
        runtime,
        daemonVersion: '1',
        buildVersion: '1',
        instanceId: 'instance',
        pid: 0,
        startedAt: '2026-02-30T12:00:00Z',
        lifecycle: 'ready',
        ready: true,
        extensionDiagnosticsCount: 0,
        activeRequestCount: 0,
      }),
    ).toThrow()
    expect(() =>
      rpcShutdownAcceptedSchema.parse({
        status: 'accepted',
        instanceId: 'instance',
        acceptedAt: '2026-07-18T12:00:00Z',
        alreadyStopping: false,
        observationTimeoutMs: 60_001,
      }),
    ).toThrow()
    expect(() =>
      rpcFailureSchema.parse({
        kind: 'ctxindex',
        taxonomy: 'other',
        code: 'code',
        message: 'message',
        retryAfterMs: -1,
      }),
    ).toThrow()
  })

  test('database lease conflict carries no owner attribution', () => {
    const failure = {
      kind: 'database_lease_conflict',
      code: 'database_lease_conflict',
      message: 'The database is held by another local process/runtime.',
      databaseDigest: digest,
    } as const
    expect(rpcFailureSchema.parse(failure)).toEqual(failure)
    expect(() =>
      rpcFailureSchema.parse({ ...failure, ownerTupleDigest: digest }),
    ).toThrow()
  })
})

describe('Account and OAuth App wire values', () => {
  test('accepts bounded Account authorization interaction and safe inventory', () => {
    expect(
      rpcAccountAddInputSchema.parse({
        provider: 'google',
        app: 'desktop',
        label: 'personal',
        loopbackTimeoutSeconds: 0.5,
      }),
    ).toEqual({
      provider: 'google',
      app: 'desktop',
      label: 'personal',
      loopbackTimeoutSeconds: 0.5,
    })
    expect(
      rpcAccountAddEventSchema.parse({
        type: 'authorization.required',
        requestId: 'request',
        authorizationUrl: 'https://accounts.example/authorize?state=opaque',
      }),
    ).toMatchObject({ requestId: 'request' })
    expect(
      rpcAccountRespondInputSchema.parse({
        requestId: 'request',
        response: 'http://localhost/callback?code=opaque&state=opaque',
      }),
    ).toMatchObject({ requestId: 'request' })
    expect(
      rpcAccountListResultSchema.parse({
        rows: [
          {
            id: 'account-id',
            provider: 'google',
            label: 'personal',
            expiresAt: null,
            expiryState: 'unknown',
            sources: [
              {
                id: 'source-id',
                label: 'mail',
                adapter: { id: 'google.mailbox' },
                realm: { id: 'realm-id', slug: 'personal', label: null },
              },
            ],
          },
        ],
      }).rows,
    ).toHaveLength(1)
  })

  test('bounds secret-bearing OAuth App input and rejects unknown config fields later', () => {
    expect(
      rpcOAuthAppRegistrationResultSchema.parse({
        environment: {
          clientId: 'CTXINDEX_GOOGLE_CLIENT_ID',
          clientSecret: 'CTXINDEX_GOOGLE_CLIENT_SECRET',
        },
      }),
    ).toMatchObject({ environment: { clientId: expect.any(String) } })
    expect(
      rpcOAuthAppAddInputSchema.parse({
        provider: 'google',
        label: 'work',
        config: { clientId: 'public-id', clientSecret: 'private-value' },
      }),
    ).toMatchObject({ provider: 'google', label: 'work' })
    expect(() =>
      rpcOAuthAppAddInputSchema.parse({
        provider: 'google',
        label: 'work',
        config: Object.fromEntries(
          Array.from({ length: 33 }, (_, index) => [`field${index}`, 'value']),
        ),
      }),
    ).toThrow()
    expect(() =>
      rpcOAuthAppAddInputSchema.parse({
        provider: 'google',
        label: 'work',
        config: { clientSecret: 'x'.repeat(16_385) },
      }),
    ).toThrow()
  })

  test('OAuth App inventory contains only safe provenance', () => {
    const value = rpcOAuthAppListResultSchema.parse({
      rows: [
        {
          providerId: 'google',
          label: 'ctxindex',
          origin: 'extension',
          provenance: {
            kind: 'extension',
            source: 'builtin',
            packageName: '@ctxindex/official',
            packageVersion: '0.1.0',
          },
        },
      ],
    })
    expect(JSON.stringify(value)).not.toMatch(/client.?id|secret|token/i)
  })
})

describe('documentation wire values', () => {
  const row = {
    extensionId: 'fixture.docs',
    path: 'README.md',
    kind: 'markdown',
    mediaType: 'text/markdown',
    byteSize: 9,
    title: 'Fixture',
  } as const

  test('keeps list and search content-free with strict bounded inputs', () => {
    expect(rpcDocumentationListInputSchema.parse({})).toEqual({})
    expect(
      rpcDocumentationListInputSchema.parse({ extensionId: 'fixture.docs' }),
    ).toEqual({ extensionId: 'fixture.docs' })
    expect(rpcDocumentationListResultSchema.parse({ rows: [row] })).toEqual({
      rows: [row],
    })
    expect(() =>
      rpcDocumentationListResultSchema.parse({
        rows: [{ ...row, content: '# private' }],
      }),
    ).toThrow()

    expect(
      rpcDocumentationSearchInputSchema.parse({ query: 'fixture' }),
    ).toEqual({ query: 'fixture' })
    const result = {
      rows: [
        {
          extensionId: 'fixture.docs',
          path: 'README.md',
          title: 'Fixture',
          snippet: '# Fixture',
        },
      ],
    }
    expect(rpcDocumentationSearchResultSchema.parse(result)).toEqual(result)
    expect(() =>
      rpcDocumentationSearchResultSchema.parse({
        rows: [{ ...result.rows[0], content: '# private' }],
      }),
    ).toThrow()
    expect(() =>
      rpcDocumentationListInputSchema.parse({ extensionId: 'x'.repeat(129) }),
    ).toThrow()
    expect(() =>
      rpcDocumentationSearchInputSchema.parse({ query: 'fixture\u001b' }),
    ).toThrow()
    expect(() =>
      rpcDocumentationSearchResultSchema.parse({
        rows: [{ ...result.rows[0], title: 'Fixture\u001b]0;unsafe\u0007' }],
      }),
    ).toThrow()
  })

  test('accepts exact text and canonical asset content while rejecting mismatches', () => {
    expect(
      rpcDocumentationGetInputSchema.parse({
        extensionId: 'fixture.docs',
        path: 'README.md',
      }),
    ).toEqual({ extensionId: 'fixture.docs', path: 'README.md' })
    expect(() =>
      rpcDocumentationGetInputSchema.parse({
        extensionId: 'fixture.docs',
        path: 'README\u001b.md',
      }),
    ).toThrow()
    expect(
      rpcDocumentationGetResultSchema.parse({
        item: { ...row, content: '# Fixture' },
      }),
    ).toEqual({ item: { ...row, content: '# Fixture' } })
    expect(
      rpcDocumentationGetResultSchema.parse({
        item: { ...row, byteSize: 10, content: '# Fixture\n' },
      }),
    ).toEqual({ item: { ...row, byteSize: 10, content: '# Fixture\n' } })
    expect(() =>
      rpcDocumentationGetResultSchema.parse({
        item: { ...row, byteSize: 10, content: '# Fixture\u001b' },
      }),
    ).toThrow()

    const png = 'iVBORw0KGgo='
    const asset = {
      extensionId: 'fixture.docs',
      path: 'assets/pixel.png',
      kind: 'asset',
      mediaType: 'image/png',
      byteSize: 8,
      contentBase64: png,
    } as const
    expect(rpcDocumentationGetResultSchema.parse({ item: asset })).toEqual({
      item: asset,
    })
    expect(() =>
      rpcDocumentationGetResultSchema.parse({
        item: { ...asset, byteSize: 7 },
      }),
    ).toThrow()
    expect(() =>
      rpcDocumentationGetResultSchema.parse({
        item: { ...asset, contentBase64: 'iVBORw0KGgp=' },
      }),
    ).toThrow()
    expect(() =>
      rpcDocumentationGetResultSchema.parse({
        item: { ...row, mediaType: 'image/png', content: '# Fixture' },
      }),
    ).toThrow()
  })
})

describe('sync/status and internal application results', () => {
  test('accepts only bounded count-only sync stream events', () => {
    const progress = {
      type: 'source.progress',
      sequence: 1,
      sourceId,
      processed: 4,
      upserts: 2,
      removals: 1,
      checkpoints: 1,
      warningsCount: 0,
    } as const
    expect(rpcSyncEventSchema.parse(progress)).toEqual(progress)
    expect(() =>
      rpcSyncEventSchema.parse({
        ...progress,
        processed: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toThrow()
    expect(() =>
      rpcSyncEventSchema.parse({
        ...progress,
        cursor: { token: 'private' },
      }),
    ).toThrow()
    expect(() =>
      rpcSyncEventSchema.parse({
        type: 'source.completed',
        sequence: 2,
        sourceId,
        run,
        payload: { private: true },
      }),
    ).toThrow()
  })

  test('accepts strict internal success and failure values', () => {
    expect(
      rpcResultSchema(rpcSyncResultSchema).parse({
        ok: true,
        value: { mode: 'sync', results: [], warnings: [] },
      }),
    ).toEqual({ ok: true, value: { mode: 'sync', results: [], warnings: [] } })
    expect(
      rpcResultSchema(rpcSyncResultSchema).parse({
        ok: false,
        error: {
          kind: 'protocol_incompatible',
          code: 'protocol_incompatible',
          message: 'incompatible',
          clientProtocol: protocol,
          daemonProtocol: protocol,
        },
      }).ok,
    ).toBe(false)
    expect(() =>
      rpcResultSchema(rpcSyncResultSchema).parse({
        ok: true,
        value: { mode: 'sync', results: [], warnings: [] },
        exitCode: 50,
      }),
    ).toThrow()
  })

  test('rejects oversized sync arrays and strict nested warning/failure fields', () => {
    expect(() =>
      rpcSyncResultSchema.parse({
        mode: 'sync',
        results: Array.from({ length: 1_025 }, (_, index) => ({
          sourceId: `source-${index}`,
          status: 'completed',
          run,
        })),
        warnings: [],
      }),
    ).toThrow()
    expect(() =>
      rpcSyncResultSchema.parse({
        mode: 'sync',
        results: [],
        warnings: Array.from({ length: 257 }, () => ({
          ...warning,
          sourceId: 'source',
        })),
      }),
    ).toThrow()
    expect(() =>
      rpcSyncResultSchema.parse({
        mode: 'sync',
        results: [
          {
            sourceId: 'source',
            status: 'failed',
            failure: {
              code: 'provider_error',
              message: 'safe',
              stack: 'secret stack',
            },
            diagnostics: {
              warningsCount: 0,
              lastWarning: null,
              errorsCount: 1,
              lastError: 'safe',
            },
          },
        ],
        warnings: [],
      }),
    ).toThrow()
  })

  test('rejects unknown request keys and oversized status rows', () => {
    expect(() =>
      rpcSyncInputSchema.parse({ mode: 'sync', extra: true }),
    ).toThrow()
    expect(() =>
      rpcStatusInputSchema.parse({ source: 'source', extra: true }),
    ).toThrow()
    const row = {
      sourceId: 'source',
      adapterId: 'adapter',
      realmSlug: 'realm',
      availability: 'available',
      lastStatus: 'completed',
      lastRunAt: null,
      warningsCount: 0,
      lastWarning: null,
      errorsCount: 0,
      lastError: null,
      cursor: null,
    } as const
    expect(() =>
      rpcStatusResultSchema.parse({
        rows: Array.from({ length: 1_025 }, () => row),
      }),
    ).toThrow()
  })
})

describe('realm/source management envelopes', () => {
  test('accepts only bounded secret backend status and switch projections', () => {
    expect(
      rpcSecretsStatusResultSchema.parse({
        backend: 'file',
        backends: {
          file: { available: true, referenceCount: 2 },
          keychain: { available: false, referenceCount: 1 },
        },
      }),
    ).toEqual({
      backend: 'file',
      backends: {
        file: { available: true, referenceCount: 2 },
        keychain: { available: false, referenceCount: 1 },
      },
    })
    expect(
      rpcSecretsBackendSetInputSchema.parse({ target: 'keychain' }),
    ).toEqual({ target: 'keychain' })
    expect(
      rpcSecretsBackendSetResultSchema.parse({
        backend: 'keychain',
        copied: 2,
        cleaned: 1,
        cleanupPending: true,
        warnings: ['Secret backend cleanup remains pending.'],
      }),
    ).toEqual({
      backend: 'keychain',
      copied: 2,
      cleaned: 1,
      cleanupPending: true,
      warnings: ['Secret backend cleanup remains pending.'],
    })
    expect(() =>
      rpcSecretsBackendSetInputSchema.parse({ target: 'env' }),
    ).toThrow()
    expect(() =>
      rpcSecretsBackendSetResultSchema.parse({
        backend: 'file',
        copied: 0,
        cleaned: 0,
        cleanupPending: true,
        warnings: ['secret\nvalue'],
      }),
    ).toThrow()
  })

  test('accepts strict bounded realm inputs and rows', () => {
    expect(
      rpcRealmAddInputSchema.parse({ slug: 'work', displayName: 'Work' }),
    ).toEqual({ slug: 'work', displayName: 'Work' })
    expect(
      rpcRealmListResultSchema.parse({
        rows: [{ id: 'work', slug: 'work', label: null, created_at: 1 }],
      }),
    ).toEqual({
      rows: [{ id: 'work', slug: 'work', label: null, created_at: 1 }],
    })
    expect(() =>
      rpcRealmAddInputSchema.parse({ slug: 'work', extra: true }),
    ).toThrow()
    expect(() =>
      rpcRealmListResultSchema.parse({
        rows: Array.from({ length: 1_025 }, (_, index) => ({
          id: `realm-${index}`,
          slug: `realm-${index}`,
          label: null,
          created_at: index,
        })),
      }),
    ).toThrow()
  })

  test('accepts strict source inputs and formatter-complete rows', () => {
    expect(
      rpcSourceAddInputSchema.parse({
        adapterId: 'local.directory',
        realmSlug: 'work',
        label: 'docs',
        account: 'personal',
        configJson: '{"root_path":"/tmp/docs"}',
        searchRouting: 'indexed',
        syncEnabled: false,
      }),
    ).toEqual({
      adapterId: 'local.directory',
      realmSlug: 'work',
      label: 'docs',
      account: 'personal',
      configJson: '{"root_path":"/tmp/docs"}',
      searchRouting: 'indexed',
      syncEnabled: false,
    })
    const row = {
      id: 'source-id',
      realm_id: 'work',
      realm_slug: 'work',
      adapter_id: 'local.directory',
      label: 'docs',
      config_json: '{"root_path":"/tmp/docs"}',
      sync_enabled: true,
      search_routing: 'indexed',
      grant_id: null,
      created_at: 1,
      availability: 'available',
      last_status: null,
      last_run_at: null,
      warnings_count: 0,
      last_warning: null,
      errors_count: 0,
      last_error: null,
      items_count: 0,
      chunks_count: 0,
      sample_uri: null,
      account_email: null,
    } as const
    expect(rpcSourceListResultSchema.parse({ rows: [row] })).toEqual({
      rows: [row],
    })
    expect(rpcSourceRemoveInputSchema.parse({ source: 'docs' })).toEqual({
      source: 'docs',
    })
    expect(() =>
      rpcSourceAddInputSchema.parse({ adapterId: 'adapter', extra: true }),
    ).toThrow()
    expect(() =>
      rpcSourceAddInputSchema.parse({ adapterId: 'adapter', grantId: 'grant' }),
    ).toThrow()
    expect(() =>
      rpcSourceListResultSchema.parse({
        rows: Array.from({ length: 1_025 }, () => row),
      }),
    ).toThrow()
    expect(() =>
      rpcSourceListResultSchema.parse({
        rows: [{ ...row, config_json: 'x'.repeat(65_537) }],
      }),
    ).toThrow()
  })
})

describe('Artifact envelopes', () => {
  const artifactRef = `${ref}/attachment/file`
  const listed = {
    resourceRef: ref,
    artifacts: [
      {
        ref: artifactRef,
        filename: 'file.bin',
        mediaType: 'application/octet-stream',
        byteSize: 14,
      },
    ],
    warnings: [],
  } as const
  const purged = {
    artifactCountRemoved: 1,
    objectCountRemoved: 1,
    logicalBytesFreed: 14,
    physicalBytesFreed: 14,
    diskAccounting: {
      artifactCount: 0,
      objectCount: 0,
      logicalBytes: 0,
      physicalBytes: 0,
    },
  } as const

  test('accepts strict descriptor listing and purge bookkeeping', () => {
    expect(rpcArtifactListInputSchema.parse({ ref })).toEqual({ ref })
    expect(rpcArtifactListResultSchema.parse(listed)).toEqual(listed)
    expect(rpcArtifactPurgeInputSchema.parse({})).toEqual({})
    expect(rpcArtifactPurgeResultSchema.parse(purged)).toEqual(purged)
  })

  test('rejects paths, unbounded arrays, malformed descriptors, and extra purge data', () => {
    expect(() =>
      rpcArtifactListResultSchema.parse({
        ...listed,
        artifacts: Array.from({ length: 1_025 }, () => listed.artifacts[0]),
      }),
    ).toThrow()
    expect(() =>
      rpcArtifactListResultSchema.parse({
        ...listed,
        artifacts: [{ ...listed.artifacts[0], localPath: '/private/cache' }],
      }),
    ).toThrow()
    expect(() =>
      rpcArtifactListResultSchema.parse({
        ...listed,
        artifacts: [{ ...listed.artifacts[0], byteSize: -1 }],
      }),
    ).toThrow()
    expect(() =>
      rpcArtifactPurgeResultSchema.parse({ ...purged, path: '/private/cache' }),
    ).toThrow()
    expect(() => rpcArtifactPurgeInputSchema.parse({ confirm: true })).toThrow()
  })
})

describe('Action envelopes', () => {
  const description = {
    id: 'example.item.create',
    profile: { id: 'example.item', version: 1 },
    effect: 'reversible',
    input: { type: 'object', additionalProperties: false },
    output: { id: 'example.item', version: 1 },
    adapters: [{ id: 'example.adapter' }],
    sources: [
      {
        id: sourceId,
        adapter: { id: 'example.adapter' },
        available: true,
      },
    ],
  } as const

  test('accepts exact source-aware describe and arbitrary JSON run input', () => {
    expect(
      rpcActionDescribeInputSchema.parse({
        actionId: description.id,
        source: sourceId,
      }),
    ).toEqual({ actionId: description.id, source: sourceId })
    expect(rpcActionDescribeResultSchema.parse(description)).toEqual(
      description,
    )
    expect(
      rpcActionRunInputSchema.parse({
        actionId: description.id,
        source: sourceId,
        actionInput: [null, true, 1.5, 'text'],
        confirmIrreversible: false,
      }),
    ).toMatchObject({ actionInput: [null, true, 1.5, 'text'] })
    expect(rpcActionRunResultSchema.parse({ resource, warnings: [] })).toEqual({
      resource,
      warnings: [],
    })
  })

  test('rejects ambiguous availability and unsafe or extra values', () => {
    expect(() =>
      rpcActionDescribeResultSchema.parse({
        ...description,
        sources: [
          {
            ...description.sources[0],
            available: false,
          },
        ],
      }),
    ).toThrow()
    expect(() =>
      rpcActionRunInputSchema.parse({
        actionId: description.id,
        source: sourceId,
        actionInput: { body: undefined },
        confirmIrreversible: false,
      }),
    ).toThrow()
    expect(() =>
      rpcActionDescribeInputSchema.parse({
        actionId: description.id,
        source: sourceId,
        extra: true,
      }),
    ).toThrow()
  })
})

describe('bounded JSON cursor', () => {
  test('Source definition defaults accept bounded fractional and structured JSON', () => {
    expect(
      rpcJsonDefaultSchema.parse({ ratio: 1.5, nested: [true, 'value'] }),
    ).toEqual({ ratio: 1.5, nested: [true, 'value'] })
    expect(() => rpcJsonCursorSchema.parse({ ratio: 1.5 })).toThrow()
  })
  test('accepts bounded JSON and rejects non-JSON values and sparse arrays', () => {
    expect(
      rpcJsonCursorSchema.parse({ page: 1, done: false, values: [null] }),
    ).toEqual({
      page: 1,
      done: false,
      values: [null],
    })
    expect(() => rpcJsonCursorSchema.parse(Number.NaN)).toThrow()
    expect(() => rpcJsonCursorSchema.parse(1.5)).toThrow()
    expect(() =>
      rpcJsonCursorSchema.parse(Number.MAX_SAFE_INTEGER + 1),
    ).toThrow()
    expect(() => rpcJsonCursorSchema.parse(new Error('hidden'))).toThrow()
    const sparse = Array(2)
    sparse[1] = null
    expect(() => rpcJsonCursorSchema.parse(sparse)).toThrow()
  })

  test('rejects cursor arrays with named, accessor, or symbol properties', () => {
    const sparseWithNamedProperty = Array(2)
    sparseWithNamedProperty[1] = null
    Object.defineProperty(sparseWithNamedProperty, 'extra', {
      enumerable: true,
      value: null,
    })

    const accessorElement: unknown[] = []
    Object.defineProperty(accessorElement, '0', {
      configurable: true,
      enumerable: true,
      get: () => null,
    })
    accessorElement.length = 1

    const symbolProperty = [null]
    Object.defineProperty(symbolProperty, Symbol('hidden'), {
      enumerable: true,
      value: null,
    })

    const nonEnumerableNamedProperty = [null]
    Object.defineProperty(nonEnumerableNamedProperty, 'hidden', {
      enumerable: false,
      value: null,
    })

    for (const value of [
      sparseWithNamedProperty,
      accessorElement,
      symbolProperty,
      nonEnumerableNamedProperty,
    ]) {
      expect(rpcJsonCursorSchema.safeParse(value).success).toBe(false)
    }
  })

  test('enforces cursor depth, entry, value, key, string, and serialized byte bounds', () => {
    let deep: unknown = null
    for (let index = 0; index < 8; index += 1) deep = [deep]
    expect(rpcJsonCursorSchema.safeParse(deep).success).toBe(true)
    deep = [deep]
    expect(rpcJsonCursorSchema.safeParse(deep).success).toBe(false)
    expect(() =>
      rpcJsonCursorSchema.parse(Array.from({ length: 257 }, () => null)),
    ).toThrow()
    expect(() =>
      rpcJsonCursorSchema.parse({ ['k'.repeat(129)]: null }),
    ).toThrow()
    expect(() => rpcJsonCursorSchema.parse('x'.repeat(4_097))).toThrow()
    expect(() =>
      rpcJsonCursorSchema.parse(
        Object.fromEntries(
          Array.from({ length: 256 }, (_, index) => [
            `level-${index}`,
            Array.from({ length: 8 }, () => null),
          ]),
        ),
      ),
    ).toThrow()
    expect(() =>
      rpcJsonCursorSchema.parse(
        Array.from({ length: 5 }, () => 'x'.repeat(4_000)),
      ),
    ).toThrow()
  })
})

describe('search, Resource, and thread contracts', () => {
  test('accepts semantic search inputs and rejects invalid combinations', () => {
    expect(
      rpcSearchInputSchema.parse({
        text: 'query',
        realms: ['work'],
        kind: 'example.item',
        fields: [{ name: 'status', value: 'open' }],
        limit: 20,
        localOnly: true,
        offset: 0,
      }),
    ).toEqual({
      text: 'query',
      realms: ['work'],
      kind: 'example.item',
      fields: [{ name: 'status', value: 'open' }],
      limit: 20,
      localOnly: true,
      offset: 0,
    })
    expect(
      rpcSearchInputSchema.parse({
        sourceIds: ['work-outlook'],
        kind: 'mail.message',
        limit: 50,
        remote: true,
      }),
    ).toEqual({
      sourceIds: ['work-outlook'],
      kind: 'mail.message',
      limit: 50,
      remote: true,
    })
    expect(
      rpcSearchInputSchema.parse({
        sourceIds: ['work-outlook'],
        kind: 'mail.message',
        limit: 50,
        remote: true,
        continuation: 'opaque-next-page',
      }),
    ).toEqual({
      sourceIds: ['work-outlook'],
      kind: 'mail.message',
      limit: 50,
      remote: true,
      continuation: 'opaque-next-page',
    })
    for (const input of [
      {},
      { text: 'query', localOnly: true, remote: true },
      { includeDeleted: true, remote: true },
      { text: 'query', offset: 1 },
      { text: 'query', remote: true, offset: 1 },
      { text: 'query', continuation: 'next' },
      { text: 'query', remote: true, continuation: 'next' },
      {
        text: 'query',
        remote: true,
        sourceIds: ['one', 'two'],
        continuation: 'next',
      },
      {
        text: 'query',
        remote: true,
        sourceIds: ['one'],
        offset: 0,
        continuation: 'next',
      },
      { text: 'query', fields: [{ name: 'status', value: 'open' }] },
      { text: 'query', since: 2, until: 1 },
      { text: 'query', extra: true },
    ]) {
      expect(rpcSearchInputSchema.safeParse(input).success).toBe(false)
    }
  })

  test('accepts strict search results and rejects oversized nested arrays', () => {
    const result = {
      results: [
        {
          ref,
          profile: { id: 'example.item', version: 1 },
          sourceId,
          origin: 'local',
          originRank: 0,
          title: 'One',
          summary: null,
          occurredAt: null,
          chunks: [{ index: 0, snippet: 'match' }],
        },
      ],
      warnings: [],
      pagination: { offset: 0, limit: 20, hasMore: false },
    } as const
    expect(rpcSearchResultSchema.parse(result)).toEqual(result)
    const remoteResult = {
      ...result,
      pagination: {
        limit: 50,
        hasMore: true,
        continuation: 'opaque-next-page',
      },
    } as const
    expect(rpcSearchResultSchema.parse(remoteResult)).toEqual(remoteResult)
    expect(() =>
      rpcSearchResultSchema.parse({
        ...result,
        pagination: {
          offset: 0,
          limit: 20,
          hasMore: true,
          continuation: 'not-local-pagination',
        },
      }),
    ).toThrow()
    expect(() =>
      rpcSearchResultSchema.parse({
        ...result,
        results: Array.from({ length: 1_025 }, () => result.results[0]),
      }),
    ).toThrow()
    expect(() =>
      rpcSearchResultSchema.parse({
        ...result,
        results: [{ ...result.results[0], rawScore: 1 }],
      }),
    ).toThrow()
  })

  test('uses one structural bounded safe-JSON schema without truncation', () => {
    const payload = { nested: [null, true, 1.5, 'text'] }
    expect(rpcSafeJsonSchema.parse(payload)).toEqual(payload)
    expect(() => rpcSafeJsonSchema.parse({ value: Number.NaN })).toThrow()
    expect(() => rpcSafeJsonSchema.parse({ value: undefined })).toThrow()
    const symbolProperty = { valid: true }
    Object.defineProperty(symbolProperty, Symbol('hidden'), {
      enumerable: true,
      value: 'not-json',
    })
    const accessorProperty = {}
    Object.defineProperty(accessorProperty, 'hidden', {
      enumerable: true,
      get: () => 'not-data',
    })
    expect(rpcSafeJsonSchema.safeParse(symbolProperty).success).toBe(false)
    expect(rpcSafeJsonSchema.safeParse(accessorProperty).success).toBe(false)

    let depth: unknown = null
    for (let index = 0; index < 16; index += 1) depth = [depth]
    expect(rpcSafeJsonSchema.safeParse(depth).success).toBe(true)
    depth = [depth]
    expect(rpcSafeJsonSchema.safeParse(depth).success).toBe(false)

    const tooManyValues = Object.fromEntries(
      Array.from({ length: 1_024 }, (_, index) => [
        `key-${index}`,
        Array.from({ length: 16 }, () => null),
      ]),
    )
    expect(rpcSafeJsonSchema.safeParse(tooManyValues).success).toBe(false)
    expect(
      rpcSafeJsonSchema.safeParse(
        Array.from({ length: 5 }, () => 'x'.repeat(65_536)),
      ).success,
    ).toBe(false)
  })

  test('validates exact get and bounded thread result shapes', () => {
    expect(rpcResourceGetInputSchema.parse({ ref })).toEqual({ ref })
    expect(rpcThreadGetInputSchema.parse({ ref })).toEqual({ ref })
    expect(() =>
      rpcResourceGetInputSchema.parse({ ref: 'not-a-ref' }),
    ).toThrow()
    expect(
      rpcResourceGetResultSchema.parse({ resource, warnings: [] }),
    ).toEqual({ resource, warnings: [] })

    const { id: _id, ...threadResource } = resource
    const thread = {
      mode: 'tree',
      messages: [{ resource: threadResource, children: [] }],
      warnings: [],
    } as const
    expect(rpcThreadGetResultSchema.parse(thread)).toEqual(thread)
    expect(() =>
      rpcThreadGetResultSchema.parse({
        ...thread,
        messages: Array.from({ length: 1_025 }, () => thread.messages[0]),
      }),
    ).toThrow()
    expect(() =>
      rpcResourceGetResultSchema.parse({
        resource: { ...resource, payload: { valid: true }, secret: 'leak' },
        warnings: [],
      }),
    ).toThrow()
  })

  test('keeps export bytes out of unary RPC and bounds an opaque transfer ticket', () => {
    const transfer = {
      ticket: 'a'.repeat(64),
      byteSize: 3,
      expiresAt: 1_000,
    }
    expect(rpcExportInputSchema.parse({ ref, format: 'eml' })).toEqual({
      ref,
      format: 'eml',
    })
    expect(rpcByteTransferDescriptorSchema.parse(transfer)).toEqual(transfer)
    expect(
      rpcExportResultSchema.parse({
        transfer,
        mediaType: 'message/rfc822',
        format: 'eml',
        ref,
        warnings: [],
      }),
    ).not.toHaveProperty('bytes')
    expect(() =>
      rpcByteTransferDescriptorSchema.parse({
        ...transfer,
        ticket: '../secret',
      }),
    ).toThrow()
    expect(() =>
      rpcExportResultSchema.parse({
        transfer,
        mediaType: 'message/rfc822',
        format: 'eml',
        ref,
        warnings: [],
        bytes: [1, 2, 3],
      }),
    ).toThrow()
  })

  test('declares result_too_large as a closed typed failure', () => {
    const failure = {
      kind: 'result_too_large',
      code: 'result_too_large',
      message: 'The result exceeds the local RPC response bounds.',
    } as const
    expect(rpcFailureSchema.parse(failure)).toEqual(failure)
    expect(() => rpcFailureSchema.parse({ ...failure, bytes: 1 })).toThrow()
  })
})
