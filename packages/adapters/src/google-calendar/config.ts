import { z } from 'zod'

export const googleCalendarSourceConfigSchema = z
  .object({
    calendar_id: z
      .string()
      .min(1)
      .refine((value) => value.trim() === value)
      .default('primary'),
    past_days: z.number().int().positive().default(365),
    future_days: z.number().int().positive().default(730),
  })
  .strict()

export type GoogleCalendarSourceConfig = z.infer<
  typeof googleCalendarSourceConfigSchema
>
