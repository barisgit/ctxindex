import { expect, test } from 'bun:test'
import type { SyncMode } from '@ctxindex/extension-sdk'
import { parseSyncArgs } from './sync'

test('parses every public SyncMode and output flag', () => {
  const modes: SyncMode[] = ['sync', 'resync', 'diff']
  for (const mode of modes) {
    expect(
      parseSyncArgs(['--mode', mode, '--format', 'events', '--json']),
    ).toEqual({
      kind: 'run',
      mode,
      json: true,
      format: 'events',
    })
  }
})
