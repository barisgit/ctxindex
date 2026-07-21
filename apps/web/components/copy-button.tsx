'use client'

import { useState } from 'react'

export function CopyButton({ value }: { value: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setState('copied')
    } catch {
      setState('failed')
    }
    window.setTimeout(() => setState('idle'), 1800)
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="ctx-copy-button"
      aria-live="polite"
    >
      {state === 'copied'
        ? 'Copied'
        : state === 'failed'
          ? 'Select to copy'
          : 'Copy commands'}
    </button>
  )
}
