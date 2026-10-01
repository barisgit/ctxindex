import { describe, expect, test } from 'bun:test'
import { evaluateReleaseGate } from '../../../scripts/release/release-gate'

describe('release gate', () => {
  test('publishes only a strictly increased unpublished semantic version', () => {
    expect(
      evaluateReleaseGate({
        previousVersion: '1.2.3',
        currentVersion: '1.3.0',
        registryStatus: 404,
      }),
    ).toEqual({ publish: true, version: '1.3.0' })
  })

  test('treats an exact existing version as an idempotent success', () => {
    expect(
      evaluateReleaseGate({
        previousVersion: '9.9.9',
        currentVersion: '1.2.3',
        registryStatus: 200,
        registryVersion: '1.2.3',
      }),
    ).toEqual({ publish: false, version: '1.2.3' })
  })

  test('retries an unchanged unpublished version after a failed release', () => {
    expect(
      evaluateReleaseGate({
        previousVersion: '1.2.3',
        currentVersion: '1.2.3',
        registryStatus: 404,
      }),
    ).toEqual({ publish: true, version: '1.2.3' })
  })

  test.each([
    {
      name: 'reversed version',
      input: {
        previousVersion: '1.2.3',
        currentVersion: '1.2.2',
        registryStatus: 404,
      },
      error: 'strictly greater',
    },
    {
      name: 'invalid semantic version',
      input: {
        previousVersion: '1.2.3',
        currentVersion: '01.2.4',
        registryStatus: 404,
      },
      error: 'valid semantic version',
    },
    {
      name: 'unexpected registry response',
      input: {
        previousVersion: '1.2.3',
        currentVersion: '1.2.4',
        registryStatus: 503,
      },
      error: 'registry response 503',
    },
    {
      name: 'mismatched registry document',
      input: {
        previousVersion: '1.2.3',
        currentVersion: '1.2.4',
        registryStatus: 200,
        registryVersion: '1.2.5',
      },
      error: 'did not confirm exact version',
    },
  ])('fails closed for $name', ({ input, error }) => {
    expect(() => evaluateReleaseGate(input)).toThrow(error)
  })
})
