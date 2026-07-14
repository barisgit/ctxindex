import { z } from 'zod'

export const logLevelSchema = z.enum([
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
])

export const configSchema = z.object({
  extensions: z
    .object({
      paths: z.array(z.string().min(1)).default([]),
    })
    .default({ paths: [] }),
  secrets: z.object({
    backend: z.enum(['keychain', 'file']),
    passphrase_env: z.string().min(1).optional(),
  }),
  log: z.object({
    level: logLevelSchema.default('info'),
    file: z.object({
      rotate: z.literal('daily').default('daily'),
      retain_days: z.number().int().positive().default(14),
      compress: z.boolean().default(true),
    }),
  }),
})

export type LogLevel = z.infer<typeof logLevelSchema>
export type CtxindexConfig = z.infer<typeof configSchema>

export function defaultConfig(): CtxindexConfig {
  return configSchema.parse({
    extensions: {},
    secrets: { backend: 'keychain' },
    log: { file: {} },
  })
}
