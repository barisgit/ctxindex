import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'

test('CI runs the D3 compiled Extension regression', async () => {
  const ci = await readFile(`${import.meta.dir}/ci.sh`, 'utf8')

  expect(ci).toContain(
    'run_gate d3-compiled-extension ./scripts/spikes/d3-compiled-extension/run.sh',
  )
})
