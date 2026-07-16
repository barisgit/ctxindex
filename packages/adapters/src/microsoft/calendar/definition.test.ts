import { describe, expect, test } from 'bun:test'
import {
  createExtensionRegistry,
  describeRegistry,
} from '@ctxindex/core/registry'
import { defineExtension } from '@ctxindex/extension-sdk'
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
      version: 1,
      auth: {
        kind: 'oauth2',
        provider: microsoftOAuthProvider,
        scopes: ['Calendars.Read'],
      },
      providerApiHosts: ['graph.microsoft.com'],
      profiles: [{ id: 'calendar.event', version: 1 }],
      routing: 'indexed',
      capabilities: ['sync', 'retrieve'],
      actions: {},
      docs: {
        summary: 'Microsoft Calendar events from one selected calendar.',
      },
    })
    expect(microsoftCalendarAdapterDefinition.operations.sync).toBeFunction()
    expect(
      microsoftCalendarAdapterDefinition.operations.retrieve,
    ).toBeFunction()
    expect(JSON.stringify(microsoftCalendarAdapterDefinition)).not.toMatch(
      /Calendars\.ReadWrite|\/beta|POST|PATCH|DELETE/i,
    )
  })

  test('publishes generated config and zero Calendar Actions', () => {
    const registry = createExtensionRegistry([
      defineExtension({
        id: 'ctxindex.microsoft-calendar.definition-test',
        version: 1,
        profiles: [calendarEventProfile],
        adapters: [microsoftCalendarAdapterDefinition],
      }),
    ])
    const description = describeRegistry(registry)
    expect(description.sources[0]).toMatchObject({
      id: 'microsoft.calendar',
      profiles: [{ id: 'calendar.event', version: 1 }],
      capabilities: ['retrieve', 'sync'],
      configOptions: [
        expect.objectContaining({
          property: 'calendar_id',
          flag: '--config-calendar-id',
          default: 'default',
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
