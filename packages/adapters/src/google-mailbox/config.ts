import { z } from 'zod'

export const gmailSourceConfigSchema = z
  .object({
    raw_records_enabled: z
      .boolean()
      .optional()
      .describe('Retain provider raw-record metadata when available.'),
    labels_include: z
      .array(z.string())
      .optional()
      .describe('Restrict provider discovery to these Gmail labels.'),
    labels_exclude: z
      .array(z.string())
      .optional()
      .describe('Exclude these Gmail labels from provider discovery.'),
    sync_window_days: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Bound the provider discovery window in days when supported.'),
  })
  .strict()
