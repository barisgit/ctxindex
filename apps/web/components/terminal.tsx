import type { ReactNode } from 'react'

const REF = 'ctx://01JG\u20269QK4/message/mid-7f3a'

/** JSON key */
function JsonKey({ children }: { children: ReactNode }) {
  return (
    <span className="text-[var(--ctx-terminal-muted-foreground)]">
      {children}
    </span>
  )
}

/** JSON string value */
function JsonValue({ children }: { children: ReactNode }) {
  return (
    <span className="text-[var(--ctx-terminal-foreground)]/85">{children}</span>
  )
}

/** Structural punctuation */
function JsonPunctuation({ children }: { children: ReactNode }) {
  return (
    <span className="text-[var(--ctx-terminal-muted-foreground)]/60">
      {children}
    </span>
  )
}

function Prompt({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <span aria-hidden className="select-none text-ctx-signal">
        $
      </span>
      <span className="min-w-0 break-words text-[var(--ctx-terminal-foreground)]">
        {children}
      </span>
    </div>
  )
}

function Flag({ children }: { children: ReactNode }) {
  return (
    <span className="whitespace-nowrap text-[var(--ctx-terminal-muted-foreground)]">
      {children}
    </span>
  )
}

export function Terminal() {
  return (
    <figure className="overflow-hidden rounded-ctx-surface border border-[var(--ctx-terminal-muted)] bg-[var(--ctx-terminal)] text-left">
      <figcaption className="sr-only">
        Example agent session: the ctxindex CLI returns machine-readable JSON
        with stable Refs that later commands consume.
      </figcaption>
      <div
        aria-hidden
        className="flex items-baseline justify-between gap-3 border-b border-[var(--ctx-terminal-muted)] px-4 py-2 font-mono text-[11px] text-[var(--ctx-terminal-muted-foreground)] sm:px-5"
      >
        <span>
          <span className="text-[var(--ctx-terminal-foreground)]/80">
            ctxindex
          </span>
          {' \u00b7 agent session'}
        </span>
        <span className="rounded-sm border border-[var(--ctx-terminal-muted)] px-1.5 py-0.5">
          --json
        </span>
      </div>
      <div className="p-4 font-mono text-xs leading-[1.7] sm:p-5 sm:text-[13px]">
        <Prompt>
          ctxindex search "flight to berlin" <Flag>--realm personal</Flag>{' '}
          <Flag>--json</Flag>
        </Prompt>
        <pre className="mt-1 break-words whitespace-pre-wrap font-mono">
          <JsonPunctuation>{'{'}</JsonPunctuation>
          {'\n  '}
          <JsonKey>"results"</JsonKey>
          <JsonPunctuation>: [{'{'}</JsonPunctuation>
          {'\n    '}
          <JsonKey>"ref"</JsonKey>
          <JsonPunctuation>: </JsonPunctuation>
          <JsonValue>"{REF}"</JsonValue>
          <JsonPunctuation>,</JsonPunctuation>
          {'\n    '}
          <JsonKey>"profile"</JsonKey>
          <JsonPunctuation>: {'{ '}</JsonPunctuation>
          <JsonKey>"id"</JsonKey>
          <JsonPunctuation>: </JsonPunctuation>
          <JsonValue>"communication.message"</JsonValue>
          <JsonPunctuation>, </JsonPunctuation>
          <JsonKey>"version"</JsonKey>
          <JsonPunctuation>: </JsonPunctuation>
          <JsonValue>1</JsonValue>
          <JsonPunctuation>{' }'},</JsonPunctuation>
          {'\n    '}
          <JsonKey>"title"</JsonKey>
          <JsonPunctuation>: </JsonPunctuation>
          <JsonValue>"Flight to Berlin"</JsonValue>
          {'\n  '}
          <JsonPunctuation>{'}'}],</JsonPunctuation>
          {'\n  '}
          <JsonKey>"warnings"</JsonKey>
          <JsonPunctuation>: []</JsonPunctuation>
          {'\n'}
          <JsonPunctuation>{'}'}</JsonPunctuation>
        </pre>
        <div className="mt-3">
          <Prompt>
            ctxindex thread '{REF}' <Flag>--json</Flag>
          </Prompt>
        </div>
        <pre className="mt-1 break-words whitespace-pre-wrap font-mono">
          <JsonPunctuation>{'{'}</JsonPunctuation>
          {'\n  '}
          <JsonKey>"mode"</JsonKey>
          <JsonPunctuation>: </JsonPunctuation>
          <JsonValue>"tree"</JsonValue>
          <JsonPunctuation>,</JsonPunctuation>
          {'\n  '}
          <JsonKey>"messages"</JsonKey>
          <JsonPunctuation>: [{'{ '}</JsonPunctuation>
          <JsonKey>"resource"</JsonKey>
          <JsonPunctuation>: {'{ '}</JsonPunctuation>
          <JsonKey>"ref"</JsonKey>
          <JsonPunctuation>: </JsonPunctuation>
          <JsonValue>"{REF}"</JsonValue>
          <JsonPunctuation>{' }'}, </JsonPunctuation>
          <JsonKey>"children"</JsonKey>
          <JsonPunctuation>: [] {'}'}],</JsonPunctuation>
          {'\n  '}
          <JsonKey>"warnings"</JsonKey>
          <JsonPunctuation>: []</JsonPunctuation>
          {'\n'}
          <JsonPunctuation>{'}'}</JsonPunctuation>
        </pre>
        <div className="mt-3 flex gap-2">
          <span aria-hidden className="select-none text-ctx-signal">
            $
          </span>
          <span aria-hidden className="ctx-cursor text-ctx-signal">
            {'\u258a'}
          </span>
        </div>
      </div>
    </figure>
  )
}
