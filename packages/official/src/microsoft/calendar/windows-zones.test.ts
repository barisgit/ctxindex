import { describe, expect, test } from 'bun:test'
import { resolveTimeZone, WINDOWS_TO_IANA } from './windows-zones'

describe('Microsoft Calendar time-zone resolution', () => {
  test('canonicalizes IANA links and Windows zones', () => {
    expect(resolveTimeZone('US/Pacific')).toBe('America/Los_Angeles')
    expect(resolveTimeZone('Europe/Kiev')).toBe('Europe/Kyiv')
    expect(resolveTimeZone('Etc/UTC')).toBe('UTC')
    expect(resolveTimeZone('Pacific Standard Time')).toBe('America/Los_Angeles')
    expect(resolveTimeZone('Europe/Ljubljana')).toBe('Europe/Ljubljana')
    expect(resolveTimeZone('Greenland Standard Time')).toBe('America/Nuuk')
    expect(resolveTimeZone('Nepal Standard Time')).toBe('Asia/Kathmandu')
    expect(resolveTimeZone('US Eastern Standard Time')).toBe(
      'America/Indiana/Indianapolis',
    )
    expect(resolveTimeZone('Argentina Standard Time')).toBe(
      'America/Argentina/Buenos_Aires',
    )
    for (const [windowsName, canonicalIanaName] of WINDOWS_TO_IANA)
      expect(resolveTimeZone(windowsName)).toBe(canonicalIanaName)
  })

  test('rejects unknown zone labels', () => {
    expect(resolveTimeZone('Synthetic/Unknown')).toBeUndefined()
  })
})
