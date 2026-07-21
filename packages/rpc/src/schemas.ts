import { z } from 'zod'

const utf8 = new TextEncoder()

function boundedString(maxBytes: number, minBytes = 1) {
  return z.string().refine(
    (value) => {
      const bytes = utf8.encode(value).byteLength
      return value.isWellFormed() && bytes >= minBytes && bytes <= maxBytes
    },
    { message: `Must contain ${minBytes}..${maxBytes} UTF-8 bytes` },
  )
}

function containsTerminalControlCharacters(
  value: string,
  allowLayout: boolean,
): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (allowLayout && (code === 9 || code === 10)) continue
    if (allowLayout && code === 13) {
      if (value.charCodeAt(index + 1) !== 10) return true
      continue
    }
    if (code <= 31 || (code >= 127 && code <= 159)) return true
  }
  return false
}

function terminalSafeString(
  maxBytes: number,
  minBytes = 1,
  allowLayout = false,
) {
  return boundedString(maxBytes, minBytes).refine(
    (value) => !containsTerminalControlCharacters(value, allowLayout),
    { message: 'Must not contain terminal control characters' },
  )
}

const identifierSchema = boundedString(128)
const publicCodeSchema = boundedString(64)
const publicMessageSchema = boundedString(512)
const longPublicStringSchema = boundedString(2_048)
const optionalPublicStringSchema = boundedString(2_048, 0)
const sourceConfigJsonSchema = boundedString(65_536, 0)
const versionStringSchema = boundedString(64)
const countSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
export const RPC_BYTE_TRANSFER_MAX_BYTES = 64 * 1_024 * 1_024
const signedTimestampMsSchema = z.number().int().safe()
const boundedCountSchema = z.number().int().min(0).max(1_000_000)
const timeoutMsSchema = z.number().int().min(0).max(60_000)
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/)
const rfc3339Schema = z.iso.datetime({ offset: true })
const timestampSchema = boundedString(32).refine(
  (value) => rfc3339Schema.safeParse(value).success,
  { message: 'Must be an RFC 3339 timestamp' },
)

const documentationExtensionIdSchema = identifierSchema.regex(
  /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/,
)
const documentationPathSchema = terminalSafeString(512).refine(
  (value) =>
    value.normalize('NFC') === value &&
    !value.startsWith('/') &&
    !value.includes('\\') &&
    !value.includes('\0') &&
    value
      .split('/')
      .every(
        (segment) => segment !== '' && segment !== '.' && segment !== '..',
      ),
  { message: 'Must be a normalized relative documentation path' },
)
const documentationTitleSchema = terminalSafeString(512)
const documentationSummarySchema = terminalSafeString(2_048)
const documentationSnippetSchema = terminalSafeString(2_048, 0)
const documentationTextSchema = terminalSafeString(256 * 1_024, 0, true)
const documentationTextByteSizeSchema = z
  .number()
  .int()
  .min(0)
  .max(256 * 1_024)
const documentationAssetByteSizeSchema = z
  .number()
  .int()
  .min(0)
  .max(2 * 1_024 * 1_024)
const documentationAssetMediaTypeSchema = z.enum([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])

function base64Value(character: string): number {
  const code = character.charCodeAt(0)
  if (code >= 65 && code <= 90) return code - 65
  if (code >= 97 && code <= 122) return code - 71
  if (code >= 48 && code <= 57) return code + 4
  return character === '+' ? 62 : character === '/' ? 63 : -1
}

function decodedBase64ByteLength(value: string): number | null {
  if (
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    return null
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  const contentLength = value.length - padding
  if (padding === 2 && (base64Value(value[contentLength - 1] ?? '') & 15) !== 0)
    return null
  if (padding === 1 && (base64Value(value[contentLength - 1] ?? '') & 3) !== 0)
    return null
  return (value.length / 4) * 3 - padding
}

const documentationBase64Schema = boundedString(
  Math.ceil((2 * 1_024 * 1_024) / 3) * 4,
).refine((value) => decodedBase64ByteLength(value) !== null, {
  message: 'Must be canonical Base64',
})

export const rpcProtocolIdentitySchema = z
  .strictObject({
    id: z.literal('ctxindex.local'),
    version: z.number().int().min(1).max(65_535),
  })
  .readonly()
export type RpcProtocolIdentity = z.infer<typeof rpcProtocolIdentitySchema>

export const rpcPresentedProtocolIdentitySchema = z
  .strictObject({
    id: identifierSchema,
    version: z.number().int().min(1).max(65_535),
  })
  .readonly()
export type RpcPresentedProtocolIdentity = z.infer<
  typeof rpcPresentedProtocolIdentitySchema
>

export const rpcRuntimeIdentitySchema = z
  .strictObject({
    tupleDigest: digestSchema,
    configDigest: digestSchema,
    dataDigest: digestSchema,
    stateDigest: digestSchema,
    cacheDigest: digestSchema,
    databaseDigest: digestSchema,
  })
  .readonly()
export type RpcRuntimeIdentity = z.infer<typeof rpcRuntimeIdentitySchema>

const RPC_ERROR_MESSAGE = 'The daemon request failed.'

type FailureRegistryInput = Record<
  string,
  { readonly message: string; readonly data: z.ZodRawShape }
>

function failureDataSchema<
  const Kind extends string,
  const Shape extends z.ZodRawShape,
>(kind: Kind, shape: Shape) {
  return z.strictObject({ ...shape, kind: z.literal(kind) }).readonly()
}

type DefinedFailureRegistry<Input extends FailureRegistryInput> = {
  readonly [Kind in keyof Input & string]: {
    readonly message: Input[Kind]['message']
    readonly data: ReturnType<
      typeof failureDataSchema<Kind, Omit<Input[Kind]['data'], 'kind'>>
    >
  }
}

export function defineRpcFailureRegistry<
  const Input extends FailureRegistryInput,
>(
  input: Input & {
    readonly [Kind in keyof Input]: {
      readonly data: Input[Kind]['data'] & { readonly kind?: never }
    }
  },
): DefinedFailureRegistry<Input> {
  // Object.entries cannot preserve its key/value correlation. This is the only
  // assertion bridge; registry correlation is covered by type and runtime tests.
  return Object.fromEntries(
    Object.entries(input).map(([kind, entry]) => [
      kind,
      { message: entry.message, data: failureDataSchema(kind, entry.data) },
    ]),
  ) as unknown as DefinedFailureRegistry<Input>
}

export const rpcFailureRegistry = defineRpcFailureRegistry({
  ctxindex: {
    message: RPC_ERROR_MESSAGE,
    data: {
      taxonomy: z.enum(['auth', 'sync', 'validation', 'lookup', 'other']),
      code: publicCodeSchema,
      message: publicMessageSchema,
      retryAfterMs: timeoutMsSchema.optional(),
    },
  },
  daemon_unavailable: {
    message: RPC_ERROR_MESSAGE,
    data: {
      code: z.literal('daemon_unavailable'),
      message: publicMessageSchema,
    },
  },
  protocol_incompatible: {
    message: RPC_ERROR_MESSAGE,
    data: {
      code: z.literal('protocol_incompatible'),
      message: publicMessageSchema,
      clientProtocol: rpcPresentedProtocolIdentitySchema,
      daemonProtocol: rpcProtocolIdentitySchema,
    },
  },
  runtime_identity_mismatch: {
    message: RPC_ERROR_MESSAGE,
    data: {
      code: z.literal('runtime_identity_mismatch'),
      message: publicMessageSchema,
      clientRuntime: rpcRuntimeIdentitySchema,
      daemonRuntime: rpcRuntimeIdentitySchema,
    },
  },
  database_lease_conflict: {
    message: RPC_ERROR_MESSAGE,
    data: {
      code: z.literal('database_lease_conflict'),
      message: publicMessageSchema,
      databaseDigest: digestSchema,
    },
  },
  prototype_unsupported: {
    message: RPC_ERROR_MESSAGE,
    data: {
      code: z.literal('prototype_unsupported'),
      message: publicMessageSchema,
      command: identifierSchema,
    },
  },
  shutdown_timeout: {
    message: RPC_ERROR_MESSAGE,
    data: {
      code: z.literal('shutdown_timeout'),
      message: publicMessageSchema,
      instanceId: identifierSchema,
      timeoutMs: timeoutMsSchema,
    },
  },
  cancelled: {
    message: RPC_ERROR_MESSAGE,
    data: { code: z.literal('cancelled'), message: publicMessageSchema },
  },
  result_too_large: {
    message: RPC_ERROR_MESSAGE,
    data: {
      code: z.literal('result_too_large'),
      message: publicMessageSchema,
    },
  },
})

type RpcFailureSchema =
  (typeof rpcFailureRegistry)[keyof typeof rpcFailureRegistry]['data']
export type RpcFailure = z.output<RpcFailureSchema>

function failureSchemaFromRegistry(
  registry: typeof rpcFailureRegistry,
): z.ZodType<RpcFailure> {
  // Object.values loses the non-empty tuple that Zod requires; the registry is
  // the tested source of truth for both this schema and the oRPC declarations.
  const schemas = Object.values(registry).map((entry) => entry.data) as [
    RpcFailureSchema,
    RpcFailureSchema,
    ...RpcFailureSchema[],
  ]
  return z.union(schemas) as z.ZodType<RpcFailure>
}

export const rpcFailureSchema = failureSchemaFromRegistry(rpcFailureRegistry)

export function rpcResultSchema<T extends z.ZodType>(valueSchema: T) {
  return z.union([
    z.strictObject({ ok: z.literal(true), value: valueSchema }).readonly(),
    z
      .strictObject({ ok: z.literal(false), error: rpcFailureSchema })
      .readonly(),
  ])
}
export type RpcResult<T> = z.output<
  ReturnType<typeof rpcResultSchema<z.ZodType<T>>>
>

export const rpcHealthInputSchema = z.strictObject({})
export type RpcHealthInput = Readonly<z.infer<typeof rpcHealthInputSchema>>

export const rpcHealthResultSchema = z
  .strictObject({
    protocol: rpcProtocolIdentitySchema,
    runtime: rpcRuntimeIdentitySchema,
    daemonVersion: versionStringSchema,
    buildVersion: versionStringSchema,
    instanceId: identifierSchema,
    pid: z.number().int().min(1).max(2_147_483_647),
    startedAt: timestampSchema,
    lifecycle: z.enum(['starting', 'ready', 'stopping']),
    ready: z.boolean(),
    extensionDiagnosticsCount: boundedCountSchema,
    activeRequestCount: boundedCountSchema,
  })
  .readonly()
export type RpcHealthResult = z.infer<typeof rpcHealthResultSchema>

const rpcOAuthAppConfigSchema = z
  .record(identifierSchema, terminalSafeString(16_384, 0))
  .superRefine((value, context) => {
    const entries = Object.entries(value)
    if (entries.length > 32) {
      context.addIssue({ code: 'custom', message: 'Too many config fields' })
      return
    }
    const bytes = entries.reduce(
      (total, [key, fieldValue]) =>
        total +
        utf8.encode(key).byteLength +
        utf8.encode(fieldValue).byteLength,
      0,
    )
    if (bytes > 65_536)
      context.addIssue({ code: 'custom', message: 'Config is too large' })
  })
  .readonly()

const rpcOAuthAppEnvironmentSchema = z
  .record(identifierSchema, z.string().regex(/^[A-Z_][A-Z0-9_]*$/))
  .refine((value) => Object.keys(value).length <= 32, {
    message: 'Too many environment fields',
  })
  .readonly()

export const rpcOAuthAppRegistrationInputSchema = z.strictObject({
  provider: identifierSchema,
})
export type RpcOAuthAppRegistrationInput = Readonly<
  z.infer<typeof rpcOAuthAppRegistrationInputSchema>
>

export const rpcOAuthAppRegistrationResultSchema = z
  .strictObject({ environment: rpcOAuthAppEnvironmentSchema })
  .readonly()
export type RpcOAuthAppRegistrationResult = z.infer<
  typeof rpcOAuthAppRegistrationResultSchema
>

export const rpcOAuthAppAddInputSchema = z.strictObject({
  provider: identifierSchema,
  label: identifierSchema,
  config: rpcOAuthAppConfigSchema,
})
export type RpcOAuthAppAddInput = Readonly<
  z.infer<typeof rpcOAuthAppAddInputSchema>
>

export const rpcOAuthAppAddResultSchema = z
  .strictObject({ providerId: identifierSchema, label: identifierSchema })
  .readonly()
export type RpcOAuthAppAddResult = z.infer<typeof rpcOAuthAppAddResultSchema>

export const rpcOAuthAppListInputSchema = z.strictObject({})
export type RpcOAuthAppListInput = Readonly<
  z.infer<typeof rpcOAuthAppListInputSchema>
>

const rpcOAuthAppProvenanceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('local') }).readonly(),
  z
    .strictObject({
      kind: z.literal('extension'),
      source: z.enum(['builtin', 'catalog', 'direct', 'explicit-path']),
      packageName: optionalPublicStringSchema.optional(),
      packageVersion: versionStringSchema.optional(),
      integrity: longPublicStringSchema.optional(),
      commit: optionalPublicStringSchema.optional(),
    })
    .readonly(),
])

export const rpcOAuthAppRowSchema = z
  .strictObject({
    providerId: identifierSchema,
    label: identifierSchema,
    origin: z.enum(['extension', 'local']),
    provenance: rpcOAuthAppProvenanceSchema,
  })
  .readonly()
export type RpcOAuthAppRow = z.infer<typeof rpcOAuthAppRowSchema>

export const rpcOAuthAppListResultSchema = z
  .strictObject({ rows: z.array(rpcOAuthAppRowSchema).max(4_096).readonly() })
  .readonly()
export type RpcOAuthAppListResult = z.infer<typeof rpcOAuthAppListResultSchema>

export const rpcOAuthAppRemoveInputSchema = z.strictObject({
  provider: identifierSchema,
  label: identifierSchema,
})
export type RpcOAuthAppRemoveInput = Readonly<
  z.infer<typeof rpcOAuthAppRemoveInputSchema>
>

export const rpcOAuthAppRemoveResultSchema = z
  .strictObject({ providerId: identifierSchema, label: identifierSchema })
  .readonly()
export type RpcOAuthAppRemoveResult = z.infer<
  typeof rpcOAuthAppRemoveResultSchema
>

export const rpcAccountAddInputSchema = z.strictObject({
  provider: identifierSchema,
  app: identifierSchema.optional(),
  label: identifierSchema.optional(),
  loopbackTimeoutSeconds: z.number().finite().min(0).max(3_600).optional(),
})
export type RpcAccountAddInput = Readonly<
  z.infer<typeof rpcAccountAddInputSchema>
>

export const rpcAccountAddEventSchema = z
  .strictObject({
    type: z.literal('authorization.required'),
    requestId: identifierSchema,
    authorizationUrl: terminalSafeString(16_384),
  })
  .readonly()
export type RpcAccountAddEvent = z.infer<typeof rpcAccountAddEventSchema>

export const rpcAccountAddResultSchema = z
  .strictObject({ accountId: identifierSchema })
  .readonly()
export type RpcAccountAddResult = z.infer<typeof rpcAccountAddResultSchema>

export const rpcAccountRespondInputSchema = z.strictObject({
  requestId: identifierSchema,
  response: terminalSafeString(16_384),
})
export type RpcAccountRespondInput = Readonly<
  z.infer<typeof rpcAccountRespondInputSchema>
>

export const rpcAccountRespondResultSchema = z
  .strictObject({ accepted: z.literal(true) })
  .readonly()
export type RpcAccountRespondResult = z.infer<
  typeof rpcAccountRespondResultSchema
>

export const rpcAccountListInputSchema = z.strictObject({})
export type RpcAccountListInput = Readonly<
  z.infer<typeof rpcAccountListInputSchema>
>

const rpcAccountSourceSchema = z
  .strictObject({
    id: identifierSchema,
    label: identifierSchema,
    adapter: z.strictObject({ id: identifierSchema }).readonly(),
    realm: z
      .strictObject({
        id: identifierSchema,
        slug: identifierSchema,
        label: optionalPublicStringSchema.nullable(),
      })
      .readonly(),
  })
  .readonly()

export const rpcAccountRowSchema = z
  .strictObject({
    id: identifierSchema,
    provider: identifierSchema,
    label: identifierSchema.nullable(),
    expiresAt: signedTimestampMsSchema.nullable(),
    expiryState: z.enum(['active', 'expired', 'unknown']),
    sources: z.array(rpcAccountSourceSchema).max(4_096).readonly(),
  })
  .readonly()
export type RpcAccountRow = z.infer<typeof rpcAccountRowSchema>

export const rpcAccountListResultSchema = z
  .strictObject({ rows: z.array(rpcAccountRowSchema).max(4_096).readonly() })
  .readonly()
export type RpcAccountListResult = z.infer<typeof rpcAccountListResultSchema>

export const rpcAccountRemoveInputSchema = z.strictObject({
  label: identifierSchema,
})
export type RpcAccountRemoveInput = Readonly<
  z.infer<typeof rpcAccountRemoveInputSchema>
>

export const rpcAccountRemoveResultSchema = z
  .strictObject({ label: identifierSchema })
  .readonly()
export type RpcAccountRemoveResult = z.infer<
  typeof rpcAccountRemoveResultSchema
>

const rpcDocumentationRowFields = {
  extensionId: documentationExtensionIdSchema,
  path: documentationPathSchema,
  title: documentationTitleSchema.optional(),
  summary: documentationSummarySchema.optional(),
}

export const rpcDocumentationRowSchema = z.discriminatedUnion('kind', [
  z
    .strictObject({
      ...rpcDocumentationRowFields,
      kind: z.literal('markdown'),
      mediaType: z.literal('text/markdown'),
      byteSize: documentationTextByteSizeSchema,
    })
    .readonly(),
  z
    .strictObject({
      ...rpcDocumentationRowFields,
      kind: z.literal('metadata'),
      mediaType: z.literal('application/json'),
      byteSize: documentationTextByteSizeSchema,
    })
    .readonly(),
  z
    .strictObject({
      ...rpcDocumentationRowFields,
      kind: z.literal('asset'),
      mediaType: documentationAssetMediaTypeSchema,
      byteSize: documentationAssetByteSizeSchema,
    })
    .readonly(),
])
export type RpcDocumentationRow = z.infer<typeof rpcDocumentationRowSchema>

export const rpcDocumentationListInputSchema = z.strictObject({
  extensionId: documentationExtensionIdSchema.optional(),
})
export type RpcDocumentationListInput = Readonly<
  z.infer<typeof rpcDocumentationListInputSchema>
>

export const rpcDocumentationListResultSchema = z
  .strictObject({
    rows: z.array(rpcDocumentationRowSchema).max(4_096).readonly(),
  })
  .readonly()
export type RpcDocumentationListResult = z.infer<
  typeof rpcDocumentationListResultSchema
>

export const rpcDocumentationGetInputSchema = z.strictObject({
  extensionId: documentationExtensionIdSchema,
  path: documentationPathSchema,
})
export type RpcDocumentationGetInput = Readonly<
  z.infer<typeof rpcDocumentationGetInputSchema>
>

export const rpcDocumentationItemSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({
      ...rpcDocumentationRowFields,
      kind: z.literal('markdown'),
      mediaType: z.literal('text/markdown'),
      byteSize: documentationTextByteSizeSchema,
      content: documentationTextSchema,
    }),
    z.strictObject({
      ...rpcDocumentationRowFields,
      kind: z.literal('metadata'),
      mediaType: z.literal('application/json'),
      byteSize: documentationTextByteSizeSchema,
      content: documentationTextSchema,
    }),
    z.strictObject({
      ...rpcDocumentationRowFields,
      kind: z.literal('asset'),
      mediaType: documentationAssetMediaTypeSchema,
      byteSize: documentationAssetByteSizeSchema,
      contentBase64: documentationBase64Schema,
    }),
  ])
  .superRefine((item, context) => {
    const byteSize =
      item.kind === 'asset'
        ? decodedBase64ByteLength(item.contentBase64)
        : utf8.encode(item.content).byteLength
    if (byteSize !== item.byteSize) {
      context.addIssue({
        code: 'custom',
        message: 'Documentation content byte size must match',
      })
    }
  })
  .readonly()
export type RpcDocumentationItem = z.infer<typeof rpcDocumentationItemSchema>

export const rpcDocumentationGetResultSchema = z
  .strictObject({ item: rpcDocumentationItemSchema })
  .readonly()
export type RpcDocumentationGetResult = z.infer<
  typeof rpcDocumentationGetResultSchema
>

export const rpcDocumentationSearchInputSchema = z.strictObject({
  query: terminalSafeString(2_048),
  extensionId: documentationExtensionIdSchema.optional(),
})
export type RpcDocumentationSearchInput = Readonly<
  z.infer<typeof rpcDocumentationSearchInputSchema>
>

export const rpcDocumentationSearchRowSchema = z
  .strictObject({
    extensionId: documentationExtensionIdSchema,
    path: documentationPathSchema,
    title: documentationTitleSchema.optional(),
    summary: documentationSummarySchema.optional(),
    snippet: documentationSnippetSchema,
  })
  .readonly()
export type RpcDocumentationSearchRow = z.infer<
  typeof rpcDocumentationSearchRowSchema
>

export const rpcDocumentationSearchResultSchema = z
  .strictObject({
    rows: z.array(rpcDocumentationSearchRowSchema).max(100).readonly(),
  })
  .readonly()
export type RpcDocumentationSearchResult = z.infer<
  typeof rpcDocumentationSearchResultSchema
>

export const rpcSyncInputSchema = z.strictObject({
  source: identifierSchema.optional(),
  mode: z.enum(['sync', 'resync', 'diff']),
})
export type RpcSyncInput = Readonly<z.infer<typeof rpcSyncInputSchema>>

export const rpcWarningSchema = z
  .strictObject({
    code: publicCodeSchema,
    message: publicMessageSchema,
    ref: longPublicStringSchema.optional(),
  })
  .readonly()
export type RpcWarning = z.infer<typeof rpcWarningSchema>

export const rpcSourceWarningSchema = z
  .strictObject({
    code: publicCodeSchema,
    message: publicMessageSchema,
    ref: longPublicStringSchema.optional(),
    sourceId: identifierSchema,
  })
  .readonly()
export type RpcSourceWarning = z.infer<typeof rpcSourceWarningSchema>

export const rpcSyncRunSchema = z
  .strictObject({
    runId: identifierSchema,
    mode: z.enum(['sync', 'resync', 'diff']),
    status: z.literal('completed'),
    added: countSchema,
    updated: countSchema,
    deleted: countSchema,
    warningsCount: countSchema,
    errorsCount: countSchema,
    lastWarning: rpcWarningSchema.nullable(),
    warnings: z.array(rpcWarningSchema).max(256).readonly(),
  })
  .readonly()
export type RpcSyncRun = z.infer<typeof rpcSyncRunSchema>

export const rpcSourceFailureSchema = z
  .strictObject({
    code: publicCodeSchema,
    message: publicMessageSchema,
  })
  .readonly()
export type RpcSourceFailure = z.infer<typeof rpcSourceFailureSchema>

export const rpcSyncFailureDiagnosticsSchema = z
  .strictObject({
    warningsCount: countSchema,
    lastWarning: rpcWarningSchema.nullable(),
    errorsCount: z.literal(1),
    lastError: longPublicStringSchema,
  })
  .readonly()
export type RpcSyncFailureDiagnostics = z.infer<
  typeof rpcSyncFailureDiagnosticsSchema
>

export const rpcSourceSyncResultSchema = z.discriminatedUnion('status', [
  z
    .strictObject({
      sourceId: identifierSchema,
      status: z.literal('completed'),
      run: rpcSyncRunSchema,
    })
    .readonly(),
  z
    .strictObject({
      sourceId: identifierSchema,
      status: z.literal('failed'),
      failure: rpcSourceFailureSchema,
      diagnostics: rpcSyncFailureDiagnosticsSchema,
    })
    .readonly(),
])
export type RpcSourceSyncResult = z.infer<typeof rpcSourceSyncResultSchema>

export const rpcSyncResultSchema = z
  .strictObject({
    mode: z.enum(['sync', 'resync', 'diff']),
    results: z.array(rpcSourceSyncResultSchema).max(1_024).readonly(),
    warnings: z.array(rpcSourceWarningSchema).max(256).readonly(),
  })
  .readonly()
export type RpcSyncResult = z.infer<typeof rpcSyncResultSchema>

export const rpcSyncEventSchema = z.discriminatedUnion('type', [
  z
    .strictObject({
      type: z.literal('source.started'),
      sequence: countSchema,
      sourceId: identifierSchema,
      mode: z.enum(['sync', 'resync', 'diff']),
    })
    .readonly(),
  z
    .strictObject({
      type: z.literal('source.progress'),
      sequence: countSchema,
      sourceId: identifierSchema,
      processed: countSchema,
      upserts: countSchema,
      removals: countSchema,
      checkpoints: countSchema,
      warningsCount: countSchema,
    })
    .readonly(),
  z
    .strictObject({
      type: z.literal('source.completed'),
      sequence: countSchema,
      sourceId: identifierSchema,
      run: rpcSyncRunSchema,
    })
    .readonly(),
  z
    .strictObject({
      type: z.literal('source.failed'),
      sequence: countSchema,
      sourceId: identifierSchema,
      failure: rpcSourceFailureSchema,
      diagnostics: rpcSyncFailureDiagnosticsSchema,
    })
    .readonly(),
])
export type RpcSyncEvent = z.infer<typeof rpcSyncEventSchema>

export type RpcJsonCursor =
  | null
  | boolean
  | number
  | string
  | readonly RpcJsonCursor[]
  | { readonly [key: string]: RpcJsonCursor }

function isBoundedJsonCursor(
  value: unknown,
  allowFiniteNumbers = false,
): value is RpcJsonCursor {
  const active = new Set<object>()
  let valueCount = 0

  const visit = (current: unknown, depth: number): boolean => {
    valueCount += 1
    if (valueCount > 2_048 || depth > 8) return false
    if (current === null || typeof current === 'boolean') return true
    if (typeof current === 'number')
      return allowFiniteNumbers
        ? Number.isFinite(current)
        : Number.isSafeInteger(current)
    if (typeof current === 'string')
      return current.isWellFormed() && utf8.encode(current).byteLength <= 4_096
    if (typeof current !== 'object' || active.has(current)) return false

    active.add(current)
    let valid = true
    if (Array.isArray(current)) {
      const ownKeys = Reflect.ownKeys(current)
      valid = current.length <= 256 && ownKeys.length === current.length + 1
      for (let index = 0; valid && index < current.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(
          current,
          String(index),
        )
        valid =
          descriptor?.enumerable === true &&
          'value' in descriptor &&
          visit(descriptor.value, depth + 1)
      }
    } else {
      const prototype = Object.getPrototypeOf(current)
      const descriptors = Object.getOwnPropertyDescriptors(current)
      const keys = Object.keys(current)
      valid =
        (prototype === Object.prototype || prototype === null) &&
        Reflect.ownKeys(current).length === keys.length &&
        keys.length <= 256 &&
        keys.every((key) => {
          const descriptor = descriptors[key]
          return (
            key.isWellFormed() &&
            utf8.encode(key).byteLength >= 1 &&
            utf8.encode(key).byteLength <= 128 &&
            descriptor?.enumerable === true &&
            'value' in descriptor &&
            visit(descriptor.value, depth + 1)
          )
        })
    }
    active.delete(current)
    return valid
  }

  if (!visit(value, 0)) return false
  try {
    return utf8.encode(JSON.stringify(value)).byteLength <= 16 * 1_024
  } catch {
    return false
  }
}

export const rpcJsonCursorSchema = z.custom<RpcJsonCursor>(
  isBoundedJsonCursor,
  {
    message: 'Must be bounded JSON cursor data',
  },
)

export const rpcJsonDefaultSchema = z.custom<RpcJsonCursor>(
  (value) => isBoundedJsonCursor(value, true),
  { message: 'Must be bounded JSON default data' },
)

export const rpcStatusInputSchema = z.strictObject({
  source: identifierSchema.optional(),
})
export type RpcStatusInput = Readonly<z.infer<typeof rpcStatusInputSchema>>

export const rpcStatusRowSchema = z
  .strictObject({
    sourceId: identifierSchema,
    adapterId: identifierSchema,
    realmSlug: identifierSchema,
    availability: z.enum(['available', 'extension_unavailable']),
    lastStatus: longPublicStringSchema,
    lastRunAt: countSchema.nullable(),
    warningsCount: countSchema,
    lastWarning: rpcWarningSchema.nullable(),
    errorsCount: countSchema,
    lastError: longPublicStringSchema.nullable(),
    cursor: rpcJsonCursorSchema,
  })
  .readonly()
export type RpcStatusRow = z.infer<typeof rpcStatusRowSchema>

export const rpcStatusResultSchema = z
  .strictObject({ rows: z.array(rpcStatusRowSchema).max(1_024).readonly() })
  .readonly()
export type RpcStatusResult = z.infer<typeof rpcStatusResultSchema>

const rpcSecretBackendSchema = z.enum(['keychain', 'file'])
const rpcSecretBackendStateSchema = z
  .strictObject({
    available: z.boolean(),
    referenceCount: countSchema,
  })
  .readonly()

export const rpcSecretsStatusInputSchema = z.strictObject({})
export type RpcSecretsStatusInput = Readonly<
  z.infer<typeof rpcSecretsStatusInputSchema>
>

export const rpcSecretsStatusResultSchema = z
  .strictObject({
    backend: rpcSecretBackendSchema,
    backends: z
      .strictObject({
        file: rpcSecretBackendStateSchema,
        keychain: rpcSecretBackendStateSchema,
      })
      .readonly(),
  })
  .readonly()
export type RpcSecretsStatusResult = z.infer<
  typeof rpcSecretsStatusResultSchema
>

export const rpcSecretsBackendSetInputSchema = z.strictObject({
  target: rpcSecretBackendSchema,
})
export type RpcSecretsBackendSetInput = Readonly<
  z.infer<typeof rpcSecretsBackendSetInputSchema>
>

export const rpcSecretsBackendSetResultSchema = z
  .strictObject({
    backend: rpcSecretBackendSchema,
    copied: countSchema,
    cleaned: countSchema,
    cleanupPending: z.boolean(),
    warnings: z.array(terminalSafeString(512)).max(16).readonly(),
  })
  .readonly()
export type RpcSecretsBackendSetResult = z.infer<
  typeof rpcSecretsBackendSetResultSchema
>

export const rpcRealmAddInputSchema = z.strictObject({
  slug: identifierSchema,
  displayName: optionalPublicStringSchema.optional(),
})
export type RpcRealmAddInput = Readonly<z.infer<typeof rpcRealmAddInputSchema>>

export const rpcRealmAddResultSchema = z
  .strictObject({ realmId: identifierSchema })
  .readonly()
export type RpcRealmAddResult = z.infer<typeof rpcRealmAddResultSchema>

export const rpcRealmListInputSchema = z.strictObject({})
export type RpcRealmListInput = Readonly<
  z.infer<typeof rpcRealmListInputSchema>
>

export const rpcRealmRowSchema = z
  .strictObject({
    id: identifierSchema,
    slug: identifierSchema,
    label: optionalPublicStringSchema.nullable(),
    created_at: countSchema,
  })
  .readonly()
export type RpcRealmRow = z.infer<typeof rpcRealmRowSchema>

export const rpcRealmListResultSchema = z
  .strictObject({ rows: z.array(rpcRealmRowSchema).max(1_024).readonly() })
  .readonly()
export type RpcRealmListResult = z.infer<typeof rpcRealmListResultSchema>

export const rpcSourceAddInputSchema = z.strictObject({
  adapterId: identifierSchema,
  realmSlug: identifierSchema.optional(),
  label: identifierSchema.optional(),
  configJson: sourceConfigJsonSchema.optional(),
  account: identifierSchema.optional(),
  searchRouting: z.enum(['indexed', 'federated', 'hybrid']).optional(),
  syncEnabled: z.boolean().optional(),
})
export type RpcSourceAddInput = Readonly<
  z.infer<typeof rpcSourceAddInputSchema>
>

export const rpcSourceAddResultSchema = z
  .strictObject({ sourceId: identifierSchema, realmId: identifierSchema })
  .readonly()
export type RpcSourceAddResult = z.infer<typeof rpcSourceAddResultSchema>

export const rpcSourceListInputSchema = z.strictObject({
  realmSlug: identifierSchema.optional(),
})
export type RpcSourceListInput = Readonly<
  z.infer<typeof rpcSourceListInputSchema>
>

export const rpcSourceRowSchema = z
  .strictObject({
    id: identifierSchema,
    realm_id: identifierSchema,
    realm_slug: identifierSchema.optional(),
    adapter_id: identifierSchema,
    label: identifierSchema,
    config_json: sourceConfigJsonSchema.nullable(),
    sync_enabled: z.boolean(),
    search_routing: z
      .enum(['indexed', 'federated', 'hybrid'])
      .nullable()
      .optional(),
    grant_id: identifierSchema.nullable().optional(),
    created_at: countSchema,
    availability: z.enum(['available', 'extension_unavailable']),
    last_status: longPublicStringSchema.nullable().optional(),
    last_run_at: countSchema.nullable().optional(),
    warnings_count: countSchema.nullable().optional(),
    last_warning: rpcWarningSchema.nullable().optional(),
    errors_count: countSchema.nullable().optional(),
    last_error: longPublicStringSchema.nullable().optional(),
    items_count: countSchema.optional(),
    chunks_count: countSchema.optional(),
    sample_uri: boundedString(8_192).nullable().optional(),
    account_email: optionalPublicStringSchema.nullable().optional(),
  })
  .readonly()
export type RpcSourceRow = z.infer<typeof rpcSourceRowSchema>

export const rpcSourceListResultSchema = z
  .strictObject({ rows: z.array(rpcSourceRowSchema).max(1_024).readonly() })
  .readonly()
export type RpcSourceListResult = z.infer<typeof rpcSourceListResultSchema>

export const rpcSourceRemoveInputSchema = z.strictObject({
  source: identifierSchema,
})
export type RpcSourceRemoveInput = Readonly<
  z.infer<typeof rpcSourceRemoveInputSchema>
>

export const rpcSourceRemoveResultSchema = z
  .strictObject({ sourceId: identifierSchema })
  .readonly()
export type RpcSourceRemoveResult = z.infer<typeof rpcSourceRemoveResultSchema>

export const rpcSourceDefinitionsInputSchema = z.strictObject({})
export type RpcSourceDefinitionsInput = Readonly<
  z.infer<typeof rpcSourceDefinitionsInputSchema>
>

export const rpcSourceConfigOptionSchema = z
  .strictObject({
    property: identifierSchema,
    flag: identifierSchema,
    type: identifierSchema,
    required: z.boolean(),
    docs: longPublicStringSchema.optional(),
    default: rpcJsonDefaultSchema.optional(),
  })
  .readonly()

export const rpcSourceDefinitionSchema = z
  .strictObject({
    id: identifierSchema,
    configOptions: z.array(rpcSourceConfigOptionSchema).max(256).readonly(),
  })
  .readonly()
export type RpcSourceDefinition = z.infer<typeof rpcSourceDefinitionSchema>

export const rpcSourceDefinitionsResultSchema = z
  .strictObject({
    rows: z.array(rpcSourceDefinitionSchema).max(1_024).readonly(),
  })
  .readonly()
export type RpcSourceDefinitionsResult = z.infer<
  typeof rpcSourceDefinitionsResultSchema
>

const refSchema = boundedString(16_417).regex(
  /^ctx:\/\/[0-9A-HJKMNP-TV-Z]{26}\/(?:[A-Za-z0-9\-._~!$&'()*+,;=:@/]|%[0-9A-F]{2})+$/,
)
const searchTextSchema = boundedString(16_384)
const payloadKeySchema = boundedString(256)
const payloadStringSchema = boundedString(65_536, 0)
const payloadNumberSchema = z.number().finite()
const resultLimitSchema = z.number().int().min(1).max(1_024)
const continuationSchema = boundedString(65_536).refine(
  (value) => value.trim().length > 0,
  { message: 'Continuation must not be blank' },
)

export type RpcSafeJson =
  | null
  | boolean
  | number
  | string
  | readonly RpcSafeJson[]
  | { readonly [key: string]: RpcSafeJson }

const safeJsonPrimitiveSchema: z.ZodType<RpcSafeJson> = z.union([
  z.null(),
  z.boolean(),
  payloadNumberSchema,
  payloadStringSchema,
])

function structuralSafeJsonSchema(depth: number): z.ZodType<RpcSafeJson> {
  if (depth === 0) return safeJsonPrimitiveSchema
  const child = structuralSafeJsonSchema(depth - 1)
  const object = z
    .record(payloadKeySchema, child)
    .superRefine((value, issue) => {
      if (Object.keys(value).length > 1_024) {
        issue.addIssue({
          code: 'custom',
          message: 'Safe JSON objects may contain at most 1024 properties',
        })
      }
    })
  return z.union([safeJsonPrimitiveSchema, z.array(child).max(1_024), object])
}

const safeJsonStructureSchema = structuralSafeJsonSchema(16)

function hasPlainJsonStructure(value: unknown): boolean {
  const active = new Set<object>()
  const visit = (current: unknown, depth: number): boolean => {
    if (
      current === null ||
      typeof current === 'boolean' ||
      typeof current === 'number' ||
      typeof current === 'string'
    ) {
      return true
    }
    if (typeof current !== 'object' || depth > 16 || active.has(current)) {
      return false
    }

    active.add(current)
    let valid: boolean
    if (Array.isArray(current)) {
      valid =
        Reflect.ownKeys(current).length === current.length + 1 &&
        current.length === Object.keys(current).length
      for (let index = 0; valid && index < current.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(
          current,
          String(index),
        )
        valid =
          descriptor?.enumerable === true &&
          'value' in descriptor &&
          visit(descriptor.value, depth + 1)
      }
    } else {
      const prototype = Object.getPrototypeOf(current)
      const descriptors = Object.getOwnPropertyDescriptors(current)
      const keys = Object.keys(current)
      valid =
        (prototype === Object.prototype || prototype === null) &&
        Reflect.ownKeys(current).length === keys.length &&
        keys.every((key) => {
          const descriptor = descriptors[key]
          return (
            descriptor?.enumerable === true &&
            'value' in descriptor &&
            visit(descriptor.value, depth + 1)
          )
        })
    }
    active.delete(current)
    return valid
  }
  return visit(value, 0)
}

const invalidSafeJson = Symbol('invalid-safe-json')

function jsonCardinality(value: RpcSafeJson): number {
  if (value === null || typeof value !== 'object') return 1
  if (Array.isArray(value)) {
    return 1 + value.reduce((count, entry) => count + jsonCardinality(entry), 0)
  }
  return (
    1 +
    Object.values(value).reduce<number>(
      (count, entry) => count + jsonCardinality(entry),
      0,
    )
  )
}

export const rpcSafeJsonSchema = z
  .preprocess(
    (value) => (hasPlainJsonStructure(value) ? value : invalidSafeJson),
    safeJsonStructureSchema,
  )
  .superRefine((value, issue) => {
    if (jsonCardinality(value) > 16_384) {
      issue.addIssue({
        code: 'custom',
        message: 'Safe JSON may contain at most 16384 values',
      })
    }
    if (utf8.encode(JSON.stringify(value)).byteLength > 256 * 1_024) {
      issue.addIssue({
        code: 'custom',
        message: 'Safe JSON may contain at most 262144 serialized bytes',
      })
    }
  })

export const rpcSearchFieldSchema = z
  .strictObject({
    name: identifierSchema,
    value: boundedString(4_096),
  })
  .readonly()
export type RpcSearchField = z.infer<typeof rpcSearchFieldSchema>

export const rpcSearchInputSchema = z
  .strictObject({
    text: searchTextSchema.optional(),
    realms: z.array(identifierSchema).max(1_024).readonly().optional(),
    sourceIds: z.array(identifierSchema).max(1_024).readonly().optional(),
    adapterId: identifierSchema.optional(),
    kind: identifierSchema.optional(),
    fields: z.array(rpcSearchFieldSchema).max(256).readonly().optional(),
    since: signedTimestampMsSchema.optional(),
    until: signedTimestampMsSchema.optional(),
    limit: resultLimitSchema.optional(),
    offset: countSchema.optional(),
    continuation: continuationSchema.optional(),
    includeDeleted: z.boolean().optional(),
    explain: z.boolean().optional(),
    localOnly: z.boolean().optional(),
    remote: z.boolean().optional(),
  })
  .superRefine((input, issue) => {
    const hasFilter =
      (input.realms?.length ?? 0) > 0 ||
      (input.sourceIds?.length ?? 0) > 0 ||
      input.adapterId !== undefined ||
      input.kind !== undefined ||
      (input.fields?.length ?? 0) > 0 ||
      input.since !== undefined ||
      input.until !== undefined ||
      input.includeDeleted === true
    if (input.text === undefined && !hasFilter) {
      issue.addIssue({
        code: 'custom',
        message: 'Search requires query text or at least one filter',
      })
    }
    if (input.localOnly === true && input.remote === true) {
      issue.addIssue({
        code: 'custom',
        message: 'localOnly and remote are mutually exclusive',
      })
    }
    if (
      input.text === undefined &&
      input.remote === true &&
      (input.realms?.length ?? 0) === 0 &&
      (input.sourceIds?.length ?? 0) === 0 &&
      input.adapterId === undefined &&
      input.kind === undefined &&
      (input.fields?.length ?? 0) === 0 &&
      input.since === undefined &&
      input.until === undefined
    ) {
      issue.addIssue({
        code: 'custom',
        message:
          'Query-less remote search requires a narrowing Realm, Adapter, Source, kind, field, or time filter',
      })
    }
    const localExecution =
      (input.text === undefined && input.remote !== true) ||
      input.localOnly === true
    if (input.offset !== undefined && !localExecution) {
      issue.addIssue({
        code: 'custom',
        message: 'Offset requires local search execution',
      })
    }
    if (input.continuation !== undefined) {
      if (input.remote !== true) {
        issue.addIssue({
          code: 'custom',
          message: 'Continuation requires remote search execution',
        })
      }
      if (input.sourceIds?.length !== 1) {
        issue.addIssue({
          code: 'custom',
          message: 'Continuation requires exactly one Source',
        })
      }
      if (input.offset !== undefined) {
        issue.addIssue({
          code: 'custom',
          message: 'Continuation cannot be combined with offset',
        })
      }
    }
    if ((input.fields?.length ?? 0) > 0 && input.kind === undefined) {
      issue.addIssue({
        code: 'custom',
        message: 'Field filters require a kind',
      })
    }
    if (
      input.since !== undefined &&
      input.until !== undefined &&
      input.since > input.until
    ) {
      issue.addIssue({
        code: 'custom',
        message: 'since must not be after until',
      })
    }
  })
export type RpcSearchInput = Readonly<z.infer<typeof rpcSearchInputSchema>>

export const rpcSearchChunkSchema = z
  .strictObject({
    index: countSchema,
    snippet: boundedString(8_192, 0),
  })
  .readonly()
export const rpcSearchRowSchema = z
  .strictObject({
    ref: refSchema,
    profile: z
      .strictObject({
        id: identifierSchema,
        version: z.number().int().min(1).max(65_535),
      })
      .readonly(),
    sourceId: identifierSchema,
    origin: z.enum(['local', 'provider']),
    originRank: countSchema,
    title: optionalPublicStringSchema.nullable(),
    summary: optionalPublicStringSchema.nullable(),
    occurredAt: signedTimestampMsSchema.nullable(),
    deletedAt: signedTimestampMsSchema.optional(),
    chunks: z.array(rpcSearchChunkSchema).max(256).readonly(),
  })
  .readonly()
export type RpcSearchRow = z.infer<typeof rpcSearchRowSchema>

export const rpcSearchWarningSchema = z
  .strictObject({
    sourceId: identifierSchema,
    code: publicCodeSchema,
    message: publicMessageSchema,
  })
  .readonly()
export const rpcSearchExplainSourceSchema = z
  .strictObject({
    sourceId: identifierSchema,
    routing: z.enum(['indexed', 'federated', 'hybrid']),
    decidedBy: z.enum(['cli', 'source', 'adapter', 'unavailable']),
    legs: z
      .array(z.enum(['local', 'remote']))
      .max(2)
      .readonly(),
    outcome: z.enum([
      'success',
      'degraded',
      'unsupported',
      'extension_unavailable',
    ]),
    coverage: z.enum(['local', 'remote', 'local+remote']),
  })
  .readonly()
export const rpcSearchResultSchema = z
  .strictObject({
    results: z.array(rpcSearchRowSchema).max(1_024).readonly(),
    warnings: z.array(rpcSearchWarningSchema).max(256).readonly(),
    pagination: z
      .union([
        z
          .strictObject({
            offset: countSchema,
            limit: resultLimitSchema,
            hasMore: z.boolean(),
          })
          .readonly(),
        z
          .strictObject({
            limit: resultLimitSchema,
            hasMore: z.boolean(),
            continuation: continuationSchema.nullable(),
          })
          .readonly(),
      ])
      .optional(),
    explain: z
      .strictObject({
        sources: z.array(rpcSearchExplainSourceSchema).max(1_024).readonly(),
      })
      .readonly()
      .optional(),
  })
  .readonly()
export type RpcSearchResult = z.infer<typeof rpcSearchResultSchema>

export const rpcResourceGetInputSchema = z.strictObject({ ref: refSchema })
export type RpcResourceGetInput = Readonly<
  z.infer<typeof rpcResourceGetInputSchema>
>

export const rpcResourceSchema = z
  .strictObject({
    ref: refSchema,
    sourceId: identifierSchema,
    realmId: identifierSchema,
    profile: z
      .strictObject({
        id: identifierSchema,
        version: z.number().int().min(1).max(65_535),
      })
      .readonly(),
    origin: z.enum(['synced', 'adhoc']),
    title: optionalPublicStringSchema.nullable(),
    summary: optionalPublicStringSchema.nullable(),
    occurredAt: signedTimestampMsSchema.nullable(),
    providerUpdatedAt: signedTimestampMsSchema.nullable(),
    deletedAt: signedTimestampMsSchema.nullable(),
    hydratedAt: signedTimestampMsSchema.nullable(),
    payload: rpcSafeJsonSchema.nullable(),
    createdAt: countSchema,
    updatedAt: countSchema,
  })
  .readonly()
export type RpcResource = z.infer<typeof rpcResourceSchema>
export const rpcStoredResourceSchema = rpcResourceSchema
  .unwrap()
  .extend({ id: identifierSchema })
  .readonly()
export type RpcStoredResource = z.infer<typeof rpcStoredResourceSchema>

export const rpcResourceWarningSchema = z
  .strictObject({
    code: publicCodeSchema,
    message: publicMessageSchema,
    ref: refSchema,
  })
  .readonly()

export const rpcByteTransferDescriptorSchema = z
  .strictObject({
    ticket: z.string().regex(/^[a-f0-9]{64}$/),
    byteSize: z.number().int().min(0).max(RPC_BYTE_TRANSFER_MAX_BYTES),
    expiresAt: countSchema,
  })
  .readonly()
export type RpcByteTransferDescriptor = z.infer<
  typeof rpcByteTransferDescriptorSchema
>

export const rpcExportInputSchema = z.strictObject({
  ref: refSchema,
  format: identifierSchema,
})
export type RpcExportInput = Readonly<z.infer<typeof rpcExportInputSchema>>

export const rpcExportResultSchema = z
  .strictObject({
    transfer: rpcByteTransferDescriptorSchema,
    mediaType: terminalSafeString(255),
    format: identifierSchema,
    ref: refSchema,
    warnings: z.array(rpcResourceWarningSchema).max(256).readonly(),
  })
  .readonly()
export type RpcExportResult = z.infer<typeof rpcExportResultSchema>

export const rpcResourceGetResultSchema = z
  .strictObject({
    resource: rpcStoredResourceSchema,
    warnings: z.array(rpcResourceWarningSchema).max(256).readonly(),
  })
  .readonly()
export type RpcResourceGetResult = z.infer<typeof rpcResourceGetResultSchema>

export const rpcArtifactDescriptorSchema = z
  .strictObject({
    ref: refSchema,
    filename: terminalSafeString(1_024, 0).optional(),
    mediaType: terminalSafeString(256, 0).optional(),
    byteSize: countSchema.optional(),
  })
  .readonly()
export type RpcArtifactDescriptor = z.infer<typeof rpcArtifactDescriptorSchema>

export const rpcArtifactWarningSchema = z
  .strictObject({
    code: publicCodeSchema,
    message: publicMessageSchema,
    ref: refSchema,
  })
  .readonly()

export const rpcArtifactListInputSchema = z.strictObject({ ref: refSchema })
export type RpcArtifactListInput = Readonly<
  z.infer<typeof rpcArtifactListInputSchema>
>

export const rpcArtifactListResultSchema = z
  .strictObject({
    resourceRef: refSchema,
    artifacts: z.array(rpcArtifactDescriptorSchema).max(1_024).readonly(),
    warnings: z.array(rpcArtifactWarningSchema).max(256).readonly(),
  })
  .readonly()
export type RpcArtifactListResult = z.infer<typeof rpcArtifactListResultSchema>

export const rpcArtifactPurgeInputSchema = z.strictObject({})
export type RpcArtifactPurgeInput = Readonly<
  z.infer<typeof rpcArtifactPurgeInputSchema>
>

export const rpcArtifactDiskAccountingSchema = z
  .strictObject({
    artifactCount: countSchema,
    objectCount: countSchema,
    logicalBytes: countSchema,
    physicalBytes: countSchema,
  })
  .readonly()

export const rpcArtifactPurgeResultSchema = z
  .strictObject({
    artifactCountRemoved: countSchema,
    objectCountRemoved: countSchema,
    logicalBytesFreed: countSchema,
    physicalBytesFreed: countSchema,
    diskAccounting: rpcArtifactDiskAccountingSchema,
  })
  .readonly()
export type RpcArtifactPurgeResult = z.infer<
  typeof rpcArtifactPurgeResultSchema
>

const rpcActionProfileSchema = z
  .strictObject({
    id: identifierSchema,
    version: z.number().int().min(1).max(65_535),
  })
  .readonly()
const rpcActionAdapterSchema = z
  .strictObject({ id: identifierSchema })
  .readonly()
const rpcActionInputDescriptionSchema = z.custom<
  Readonly<Record<string, RpcSafeJson>>
>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    rpcSafeJsonSchema.safeParse(value).success,
  { message: 'Must be a bounded safe JSON object' },
)

export const rpcActionDescribeInputSchema = z.strictObject({
  actionId: identifierSchema,
  source: identifierSchema,
})
export type RpcActionDescribeInput = Readonly<
  z.infer<typeof rpcActionDescribeInputSchema>
>

export const rpcActionDescribeResultSchema = z
  .strictObject({
    id: identifierSchema,
    profile: rpcActionProfileSchema,
    effect: z.enum(['reversible', 'irreversible']),
    input: rpcActionInputDescriptionSchema,
    output: rpcActionProfileSchema,
    adapters: z.array(rpcActionAdapterSchema).max(1_024).readonly(),
    sources: z
      .array(
        z.union([
          z
            .strictObject({
              id: identifierSchema,
              adapter: rpcActionAdapterSchema,
              available: z.literal(true),
            })
            .readonly(),
          z
            .strictObject({
              id: identifierSchema,
              adapter: rpcActionAdapterSchema,
              available: z.literal(false),
              reason: z.enum(['adapter_unavailable', 'action_unsupported']),
            })
            .readonly(),
        ]),
      )
      .max(1_024)
      .readonly(),
  })
  .readonly()
export type RpcActionDescribeResult = z.infer<
  typeof rpcActionDescribeResultSchema
>

export const rpcActionRunInputSchema = z.strictObject({
  actionId: identifierSchema,
  source: identifierSchema,
  actionInput: rpcSafeJsonSchema,
  confirmIrreversible: z.boolean(),
})
export type RpcActionRunInput = Readonly<
  z.infer<typeof rpcActionRunInputSchema>
>

export const rpcActionRunResultSchema = z
  .strictObject({
    resource: rpcStoredResourceSchema,
    warnings: z.array(rpcResourceWarningSchema).max(256).readonly(),
  })
  .readonly()
export type RpcActionRunResult = z.infer<typeof rpcActionRunResultSchema>

export const rpcThreadGetInputSchema = z.strictObject({ ref: refSchema })
export type RpcThreadGetInput = Readonly<
  z.infer<typeof rpcThreadGetInputSchema>
>

export type RpcThreadNode = {
  readonly resource: RpcResource
  readonly children: readonly RpcThreadNode[]
}

function threadNodeSchema(depth: number): z.ZodType<RpcThreadNode> {
  const children =
    depth === 0
      ? z.tuple([])
      : z
          .array(threadNodeSchema(depth - 1))
          .max(1_024)
          .readonly()
  return z
    .strictObject({
      resource: rpcResourceSchema,
      children,
    })
    .readonly() as z.ZodType<RpcThreadNode>
}

export const rpcThreadNodeSchema = threadNodeSchema(64)
export const rpcThreadWarningSchema = z
  .strictObject({
    code: z.literal('unknown_profile_version'),
    profileId: identifierSchema,
    profileVersion: z.number().int().min(1).max(65_535),
  })
  .readonly()
export const rpcThreadGetResultSchema = z
  .strictObject({
    mode: z.enum(['tree', 'flat']),
    messages: z.array(rpcThreadNodeSchema).max(1_024).readonly(),
    warnings: z.array(rpcThreadWarningSchema).max(256).readonly(),
  })
  .superRefine((value, issue) => {
    const pending = [...value.messages]
    let nodeCount = 0
    while (pending.length > 0) {
      const node = pending.pop() as RpcThreadNode
      nodeCount += 1
      if (nodeCount > 1_024) {
        issue.addIssue({
          code: 'custom',
          message: 'Thread results may contain at most 1024 nodes',
        })
        break
      }
      pending.push(...node.children)
    }
    if (utf8.encode(JSON.stringify(value)).byteLength > 1024 * 1_024) {
      issue.addIssue({
        code: 'custom',
        message: 'Thread results may contain at most 1048576 serialized bytes',
      })
    }
  })
  .readonly()
export type RpcThreadGetResult = z.infer<typeof rpcThreadGetResultSchema>

export const rpcShutdownInputSchema = z.strictObject({})
export type RpcShutdownInput = Readonly<z.infer<typeof rpcShutdownInputSchema>>

export const rpcShutdownAcceptedSchema = z
  .strictObject({
    status: z.literal('accepted'),
    instanceId: identifierSchema,
    acceptedAt: timestampSchema,
    alreadyStopping: z.boolean(),
    observationTimeoutMs: z.number().int().min(1).max(60_000),
  })
  .readonly()
export type RpcShutdownAccepted = z.infer<typeof rpcShutdownAcceptedSchema>

export const rpcTransportContextSchema = z
  .strictObject({
    requestId: identifierSchema,
    clientProtocol: rpcPresentedProtocolIdentitySchema,
    clientRuntime: rpcRuntimeIdentitySchema,
  })
  .readonly()
export type RpcTransportContext = z.infer<typeof rpcTransportContextSchema>

export interface RpcRequestContext extends RpcTransportContext {
  readonly signal: AbortSignal
}
