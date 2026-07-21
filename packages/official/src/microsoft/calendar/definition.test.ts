import { describe, expect, test } from 'bun:test'
import { calendarEventProfile } from '@ctxindex/profiles'
import { microsoftOAuthProvider } from '../provider'
import {
  microsoftCalendarAdapterDefinition,
  microsoftCalendarSourceConfigSchema,
} from './definition'

describe('microsoft.calendar definition', () => {
  test('declares one strict default or explicit calendar and positive rolling window', () => {
    expect(microsoftCalendarSourceConfigSchema.parse({})).toEqual({
      calendar_id: 'default',
      past_days: 365,
      future_days: 730,
    })
    expect(
      microsoftCalendarSourceConfigSchema.parse({
        calendar_id: 'named/calendar-id',
        past_days: 30,
        future_days: 90,
      }),
    ).toEqual({
      calendar_id: 'named/calendar-id',
      past_days: 30,
      future_days: 90,
    })
    for (const invalid of [
      { calendar_id: '' },
      { calendar_id: ' ' },
      { calendar_id: ' default' },
      { past_days: 0 },
      { past_days: 1.5 },
      { future_days: -1 },
      { access_token: 'forbidden' },
    ]) {
      expect(
        microsoftCalendarSourceConfigSchema.safeParse(invalid).success,
      ).toBe(false)
    }
  })

  test('uses shared Microsoft identity and only read-only Calendar scope', () => {
    expect(microsoftCalendarAdapterDefinition).toMatchObject({
      id: 'microsoft.calendar',
      provider: microsoftOAuthProvider,
      access: {
        scopes: ['Calendars.Read'],
      },
      providerApiHosts: ['graph.microsoft.com'],
      profiles: [calendarEventProfile],
      routing: 'indexed',
      capabilities: ['sync', 'retrieve'],
      actions: {},
    })
    expect(microsoftCalendarAdapterDefinition).not.toHaveProperty('version')
    expect(microsoftCalendarAdapterDefinition).not.toHaveProperty('auth')
    expect(microsoftCalendarAdapterDefinition).not.toHaveProperty('docs')
    expect(microsoftCalendarAdapterDefinition.provider).toBe(
      microsoftOAuthProvider,
    )
    expect(microsoftCalendarAdapterDefinition.profiles[0]).toBe(
      calendarEventProfile,
    )
    expect(microsoftCalendarAdapterDefinition.operations.sync).toBeFunction()
    expect(
      microsoftCalendarAdapterDefinition.operations.retrieve,
    ).toBeFunction()
    expect(JSON.stringify(microsoftCalendarAdapterDefinition)).not.toMatch(
      /Calendars\.ReadWrite|\/beta|POST|PATCH|DELETE/i,
    )
  })

  test('publishes strict config and zero Calendar Actions', () => {
    expect(microsoftCalendarAdapterDefinition.configSchema).toBe(
      microsoftCalendarSourceConfigSchema,
    )
    expect(microsoftCalendarAdapterDefinition.actions).toEqual({})
  })
})
