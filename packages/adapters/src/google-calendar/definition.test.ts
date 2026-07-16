import { describe, expect, test } from 'bun:test'
import {
  createExtensionRegistry,
  describeRegistry,
} from '@ctxindex/core/registry'
import { defineExtension } from '@ctxindex/extension-sdk'
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
      version: 1,
      profiles: [{ id: 'calendar.event', version: 1 }],
      routing: 'indexed',
      capabilities: ['sync', 'retrieve'],
      providerApiHosts: ['www.googleapis.com'],
      actions: {},
      docs: { summary: 'Google Calendar events from one selected calendar.' },
    })
    expect(googleCalendarAdapterDefinition.auth).toEqual({
      kind: 'oauth2',
      provider: googleOAuthProvider,
      scopes: ['https://www.googleapis.com/auth/calendar.events.readonly'],
    })
    expect(googleCalendarAdapterDefinition.operations.sync).toBeFunction()
    expect(googleCalendarAdapterDefinition.operations.retrieve).toBeFunction()
  })

  test('publishes generated config and zero Calendar Actions', () => {
    const registry = createExtensionRegistry([
      defineExtension({
        id: 'ctxindex.google-calendar.definition-test',
        version: 1,
        profiles: [calendarEventProfile],
        adapters: [googleCalendarAdapterDefinition],
      }),
    ])
    const description = describeRegistry(registry)

    expect(description.sources[0]).toMatchObject({
      id: 'google.calendar',
      profiles: [{ id: 'calendar.event', version: 1 }],
      capabilities: ['retrieve', 'sync'],
      configOptions: [
        expect.objectContaining({
          property: 'calendar_id',
          flag: '--config-calendar-id',
          default: 'primary',
        }),
        expect.objectContaining({
          property: 'future_days',
          flag: '--config-future-days',
          default: 730,
        }),
        expect.objectContaining({
          property: 'past_days',
          flag: '--config-past-days',
          default: 365,
        }),
      ],
    })
    expect(description.actions).toEqual([])
  })
})
