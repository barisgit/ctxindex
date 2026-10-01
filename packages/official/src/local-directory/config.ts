import { isAbsolute } from 'node:path'
import { z } from 'zod'

export const DEFAULT_SIZE_CAP_BYTES = 2 * 1024 * 1024

const nonemptyStrings = z.array(z.string().min(1)).min(1)

export const localDirectorySourceConfigSchema = z
  .object({
    root_path: z
      .string()
      .min(1)
      .refine(isAbsolute, 'root_path must be absolute')
      .describe('Absolute root directory to index.'),
    include: nonemptyStrings
      .optional()
      .describe('Repeatable glob patterns that select paths to include.'),
    exclude: nonemptyStrings
      .optional()
      .describe('Repeatable glob patterns that select paths to exclude.'),
    size_cap_bytes: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Maximum file size in bytes; larger files are skipped.'),
  })
  .strict()

export type LocalDirectoryConfig = z.infer<
  typeof localDirectorySourceConfigSchema
>
