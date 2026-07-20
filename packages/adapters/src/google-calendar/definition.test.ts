import { describe, expect, test } from 'bun:test'
import { calendarEventProfile } from '@ctxindex/profiles'
import { googleOAuthProvider } from '../google-oauth-provider'
import {
  googleCalendarAdapterDefinition,
  googleCalendarSourceConfigSchema,
} from './definition'

describe('google.calendar definition', () => {
  test('declares one strict calendar selection and positive rolling window', () => {
    expect(googleCalendarSourceConfigSchema.parse({})).toEqual({
      calendar_id: 'primary',
      past_days: 365,
      future_days: 730,
    })
    expect(
      googleCalendarSourceConfigSchema.parse({
        calendar_id: 'team@example.test',
        past_days: 30,
        future_days: 90,
      }),
    ).toEqual({
      calendar_id: 'team@example.test',
      past_days: 30,
      future_days: 90,
    })
    for (const invalid of [
      { calendar_id: '' },
      { calendar_id: ' ' },
      { calendar_id: ' primary' },
      { past_days: 0 },
      { past_days: 1.5 },
      { future_days: -1 },
      { access_token: 'forbidden' },
    ]) {
      expect(googleCalendarSourceConfigSchema.safeParse(invalid).success).toBe(
        false,
      )
    }
  })

  test('uses the shared Google identity contract and only Calendar read scope', () => {
    expect(googleCalendarAdapterDefinition).toMatchObject({
      id: 'google.calendar',
      provider: googleOAuthProvider,
      access: {
        scopes: ['https://www.googleapis.com/auth/calendar.events.readonly'],
      },
      profiles: [calendarEventProfile],
      routing: 'indexed',
      capabilities: ['sync', 'retrieve'],
      providerApiHosts: ['www.googleapis.com'],
      actions: {},
    })
    expect(googleCalendarAdapterDefinition).not.toHaveProperty('version')
    expect(googleCalendarAdapterDefinition).not.toHaveProperty('auth')
    expect(googleCalendarAdapterDefinition).not.toHaveProperty('docs')
    expect(googleCalendarAdapterDefinition.provider).toBe(googleOAuthProvider)
    expect(googleCalendarAdapterDefinition.profiles[0]).toBe(
      calendarEventProfile,
    )
    expect(googleCalendarAdapterDefinition.operations.sync).toBeFunction()
    expect(googleCalendarAdapterDefinition.operations.retrieve).toBeFunction()
  })

  test('publishes strict config and zero Calendar Actions', () => {
    expect(googleCalendarAdapterDefinition.configSchema).toBe(
      googleCalendarSourceConfigSchema,
    )
    expect(googleCalendarAdapterDefinition.actions).toEqual({})
  })
})
