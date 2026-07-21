import type { ReactNode } from 'react'

const REF = 'ctx://01J00000000000000000000000/file/aurora.txt'

export const SEARCH_RESULT_JSON = `{
  "results": [{
    "ref": "${REF}",
    "profile": {"id": "file", "version": 1},
    "sourceId": "01J00000000000000000000000",
    "origin": "local", "originRank": 0,
    "title": "aurora.txt",
    "summary": null,
    "occurredAt": 1784109600000,
    "chunks": [{
      "index": 0,
      "snippet": "Project Aurora kickoff is Tuesday at 10:00."
    }]
  }],
  "pagination": {"offset": 0, "limit": 20, "hasMore": false},
  "warnings": []
}`

function Token({ muted, children }: { muted?: boolean; children: ReactNode }) {
  return (
    <span
      className={
        muted
          ? 'text-[var(--ctx-terminal-muted-foreground)]'
          : 'text-[var(--ctx-terminal-foreground)]'
      }
    >
      {children}
    </span>
  )
}

export function Terminal() {
  return (
    <figure className="overflow-hidden rounded-ctx-surface border border-[var(--ctx-terminal-muted)] bg-[var(--ctx-terminal)] text-left">
      <figcaption className="sr-only">
        A shell-capable agent searches one exact Realm and receives a stable Ref
        with a typed file Profile in machine-readable JSON.
      </figcaption>
      <div
        aria-hidden
        className="flex min-h-11 items-center justify-between gap-4 border-b border-[var(--ctx-terminal-muted)] px-4 font-mono text-[0.6875rem] text-[var(--ctx-terminal-muted-foreground)] sm:px-5"
      >
        <span>
          <span className="text-[var(--ctx-terminal-foreground)]/85">
            ctxindex
          </span>{' '}
          · agent shell
        </span>
        <span>stable JSON</span>
      </div>
      <div className="overflow-x-auto p-4 font-mono text-xs leading-[1.65] sm:p-5 sm:text-[0.8125rem] sm:leading-[1.7]">
        <div className="min-w-[21rem] sm:min-w-[34rem]">
          <div className="flex gap-2 whitespace-pre text-[var(--ctx-terminal-foreground)]">
            <span aria-hidden className="select-none text-ctx-signal">
              $
            </span>
            <span>
              ctxindex search &quot;Aurora kickoff&quot;{' '}
              <Token muted>--realm work --kind file --json</Token>
            </span>
          </div>

          <pre className="mt-3 font-mono text-[var(--ctx-terminal-foreground)]">
            {SEARCH_RESULT_JSON}
          </pre>

          <div className="mt-3 flex gap-2" aria-hidden>
            <span className="select-none text-ctx-signal">$</span>
            <span className="ctx-cursor text-ctx-signal">{'\u258a'}</span>
          </div>
        </div>
      </div>
    </figure>
  )
}
