import { isAbsolute } from 'node:path'
import { z } from 'zod'

export const DEFAULT_SIZE_CAP_BYTES = 2 * 1024 * 1024

const nonemptyStrings = z.array(z.string().min(1)).min(1)

export const localDirectorySourceConfigSchema = z
  .object({
    root_path: z
      .string()
      .min(1)
      .refine(isAbsolute, 'root_path must be absolute'),
    include: nonemptyStrings.optional(),
    exclude: nonemptyStrings.optional(),
    size_cap_bytes: z.number().int().positive().optional(),
  })
  .strict()

export type LocalDirectoryConfig = z.infer<
  typeof localDirectorySourceConfigSchema
>
